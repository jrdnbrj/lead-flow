#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Apply a guarded, structured patch to exactly the current story file."""

from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

from lib import (
    ContractError,
    atomic_write_json,
    atomic_write_text,
    default_runtime,
    extract_bmad_status,
    load_json,
    now_utc,
    read_jsonl,
    relative_path,
    repo_dirty_paths,
    require_valid_state,
    resolve_path,
    sha256_file,
    state_stories,
    story_id_from_content,
    extract_dependencies,
)


def decision_allows_dependency_change(runtime: Path, decision_id: str | None) -> bool:
    if not decision_id:
        return False
    return any(
        entry.get("decision_id") == decision_id
        and entry.get("category") in {"PRODUCT_DECISION", "ARCHITECTURAL_CONTRADICTION"}
        and bool(entry.get("user_decision"))
        for entry in read_jsonl(runtime / "decision-ledger.jsonl")
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--runtime", default=None)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--patch", required=True, help="Structured repair-result JSON")
    parser.add_argument("--decision-id", default=None)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        state_path = runtime / "state.json"
        state = require_valid_state(state_path, root)
        stories = state_stories(state)
        if args.story_id not in stories:
            raise ContractError(f"unknown story_id: {args.story_id}")
        story = stories[args.story_id]
        patch = load_json(Path(args.patch).resolve())
        if patch.get("schema_version") != "1.0":
            raise ContractError("repair patch schema_version must be 1.0")
        if patch.get("story_id") != args.story_id:
            raise ContractError("patch story_id does not match requested story")
        if patch.get("target_story_file") != story["story_file"]:
            raise ContractError("patch target_story_file is not the exact current story file")
        story_path = resolve_path(root, story["story_file"])
        implementation_dir = (root / "_bmad-output" / "implementation-artifacts").resolve()
        if not story_path.is_relative_to(implementation_dir):
            raise ContractError("story patch target escapes implementation-artifacts")
        before_hash = sha256_file(story_path)
        if patch.get("expected_fingerprint") != before_hash:
            raise ContractError("expected fingerprint does not match current story")
        before = story_path.read_text(encoding="utf-8")
        if story_id_from_content(before) != args.story_id:
            raise ContractError("current story_id cannot be verified from story heading")
        before_status = extract_bmad_status(before)
        before_dependencies = extract_dependencies(story_path)
        after = before
        changes = patch.get("changes")
        if not isinstance(changes, list) or not changes:
            raise ContractError("patch changes must be a non-empty array")
        for change in changes:
            if not isinstance(change, dict) or not isinstance(change.get("old_text"), str) or not isinstance(change.get("new_text"), str):
                raise ContractError("each patch change requires old_text and new_text")
            expected_occurrences = int(change.get("occurrences", 1))
            if expected_occurrences < 1 or after.count(change["old_text"]) != expected_occurrences:
                raise ContractError("patch old_text occurrence count mismatch")
            after = after.replace(change["old_text"], change["new_text"], expected_occurrences)
        if story_id_from_content(after) != args.story_id:
            raise ContractError("patch changes story_id")
        if extract_bmad_status(after) != before_status:
            raise ContractError("BMad Status can only be projected by ready_gate.py")
        after_dependencies = extract_dependencies_from_text(after)
        if after_dependencies != before_dependencies and not decision_allows_dependency_change(runtime, args.decision_id):
            raise ContractError("patch changes dependencies without explicit authorized decision")
        if before == after:
            raise ContractError("patch makes no content change")
        dirty_before = repo_dirty_paths(root)
        diff = "".join(difflib.unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile=relative_path(root, story_path),
            tofile=relative_path(root, story_path),
        ))
        repair_round = story.get("repair_round", 0) + 1
        if repair_round > 3:
            raise ContractError("repair_round limit exceeded")
        diff_path = runtime / "runs" / args.story_id / "diffs" / f"repair-{repair_round:03d}.patch"
        atomic_write_text(diff_path, diff)
        dirty_after_diff = repo_dirty_paths(root)
        if dirty_before is not None and dirty_after_diff is not None:
            allowed = dirty_before | {relative_path(root, diff_path)}
            if not dirty_after_diff.issubset(allowed):
                raise ContractError("another file changed before story patch application")
        atomic_write_text(story_path, after)
        dirty_after_story = repo_dirty_paths(root)
        if dirty_before is not None and dirty_after_story is not None:
            allowed = dirty_before | {relative_path(root, diff_path), relative_path(root, story_path)}
            if not dirty_after_story.issubset(allowed):
                raise ContractError("patch detected modification of an unallowlisted file")
        new_hash = sha256_file(story_path)
        result = {
            "schema_version": "1.0",
            "story_id": args.story_id,
            "target_story_file": story["story_file"],
            "expected_fingerprint": before_hash,
            "new_fingerprint": new_hash,
            "diff_artifact": relative_path(root, diff_path),
            "repair_round": repair_round,
            "applied_at": now_utc(),
            "changes_count": len(changes),
            "dependency_change_authorized": after_dependencies != before_dependencies,
        }
        result_path = runtime / "runs" / args.story_id / f"repair-result-{repair_round:03d}.json"
        atomic_write_json(result_path, result)
        story["status"] = "REVALIDATING"
        story["current_gate"] = "REVALIDATING"
        story["repair_round"] = repair_round
        story["fingerprint"] = {"algorithm": "sha256", "value": new_hash, "captured_at": result["applied_at"]}
        story["last_result"] = {
            "gate": "AUTO_FIX",
            "verdict": "APPLIED",
            "iteration": story.get("review_round", 0),
            "evidence_refs": list(story.get("evidence_refs", [])),
            "artifact": relative_path(root, result_path),
            "timestamp": result["applied_at"],
        }
        story.setdefault("timestamps", {})["updated_at"] = result["applied_at"]
        state["state_revision"] += 1
        atomic_write_json(state_path, state)
        print(json.dumps({"ok": True, **result, "result_artifact": relative_path(root, result_path)}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


def extract_dependencies_from_text(content: str) -> list[str]:
    import re
    from lib import DEPENDENCY_RE, normalize_story_id, story_sort_key

    section = re.search(r"^##\s+Dependencies\s*$([\s\S]*?)(?=^##\s+|\Z)", content, re.I | re.M)
    if not section:
        return []
    values = {normalize_story_id(match.group(0)) for match in DEPENDENCY_RE.finditer(section.group(1))}
    return sorted(values, key=story_sort_key)


if __name__ == "__main__":
    sys.exit(main())
