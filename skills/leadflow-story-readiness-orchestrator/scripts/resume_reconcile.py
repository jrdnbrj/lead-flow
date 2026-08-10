#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Resume safely and propagate story/source/dependency invalidations."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    append_jsonl,
    atomic_write_json,
    default_runtime,
    evidence_index,
    now_utc,
    require_valid_state,
    resolve_path,
    sha256_file,
    state_stories,
    story_sort_key,
)


def controlled_status_projection_matches(story: dict[str, Any], expected_hash: str, current_hash: str) -> bool:
    projection = story.get("status_projection")
    return (
        isinstance(projection, dict)
        and projection.get("field") == "Status"
        and projection.get("to") == "ready-for-dev"
        and projection.get("validated_hash") == expected_hash
        and projection.get("final_hash") == current_hash
    )


def changed_reasons(root: Path, story: dict[str, Any], stories: dict[str, dict[str, Any]]) -> list[str]:
    reasons: list[str] = []
    story_path = resolve_path(root, story["story_file"])
    if not story_path.is_file():
        reasons.append("STORY_ARTIFACT_MISSING")
    elif sha256_file(story_path) != story.get("fingerprint", {}).get("value"):
        reasons.append("STORY_FINGERPRINT_CHANGED")
    for reference in story.get("authoritative_fingerprints", []):
        path = resolve_path(root, reference["path"])
        if not path.is_file():
            reasons.append(f"SOURCE_MISSING:{reference['path']}")
        elif sha256_file(path) != reference.get("sha256"):
            current_hash = sha256_file(path)
            if not (
                reference.get("path") == story.get("story_file")
                and controlled_status_projection_matches(story, reference.get("sha256"), current_hash)
            ):
                reasons.append(f"SOURCE_CHANGED:{reference['path']}")
    for dependency in story.get("dependencies", []):
        dependency_story = stories[dependency]
        if dependency_story.get("status") != "READY_FOR_DEV":
            reasons.append(f"DEPENDENCY_NOT_READY:{dependency}")
        stored = next(
            (item for item in story.get("dependency_fingerprints", []) if item.get("story_id") == dependency),
            None,
        )
        current_path = resolve_path(root, dependency_story["story_file"])
        if stored and current_path.is_file() and sha256_file(current_path) != stored.get("sha256"):
            current_hash = sha256_file(current_path)
            if not controlled_status_projection_matches(dependency_story, stored.get("sha256"), current_hash):
                reasons.append(f"DEPENDENCY_FINGERPRINT_CHANGED:{dependency}")
    return sorted(set(reasons))


def reconcile(root: Path, runtime: Path) -> dict[str, Any]:
    state_path = runtime / "state.json"
    state = require_valid_state(state_path, root)
    stories = state_stories(state)
    invalidated: list[dict[str, Any]] = []
    changed = True
    while changed:
        changed = False
        for story_id in sorted(stories, key=story_sort_key):
            story = stories[story_id]
            if story.get("status") != "READY_FOR_DEV":
                continue
            reasons = changed_reasons(root, story, stories)
            if not reasons:
                continue
            evidence_id = f"EV-INVALIDATION-{story_id}-{state['state_revision'] + 1:03d}"
            story.update({
                "status": "NEEDS_REVALIDATION",
                "current_gate": "VALIDATE",
                "review_round": 0,
                "repair_round": 0,
                "last_result": {
                    "gate": "VALIDATE",
                    "verdict": "FAIL",
                    "iteration": 0,
                    "evidence_refs": [evidence_id],
                    "reasons": reasons,
                    "timestamp": now_utc(),
                },
                "blockers_open": [
                    {"blocker_id": f"INVALIDATION-{index + 1}", "classification": "TECHNICAL_DETERMINISTIC", "reason": reason}
                    for index, reason in enumerate(reasons)
                ],
                "decision_required": False,
                "pending_decision_ref": None,
            })
            story.setdefault("timestamps", {})["updated_at"] = now_utc()
            story["evidence_refs"] = list(story.get("evidence_refs", [])) + [evidence_id]
            invalidated.append({"story_id": story_id, "reasons": reasons, "evidence_id": evidence_id})
            changed = True
    if invalidated:
        state["state_revision"] += 1
        atomic_write_json(state_path, state)
        evidence_path = runtime / "evidence-ledger.jsonl"
        for item in invalidated:
            append_jsonl(evidence_path, {
                "evidence_id": item["evidence_id"],
                "story": item["story_id"],
                "gate": "INVALIDATION",
                "iteration": 0,
                "input_artifact": "state.json",
                "reviewer_result": "deterministic-reconcile",
                "blockers": item["reasons"],
                "resolution": [],
                "timestamp": now_utc(),
                "final_verdict": "FAIL",
            })
        atomic_write_json(runtime / "evidence-index.json", evidence_index(evidence_path))
    return {"invalidated": invalidated, "state_revision": state["state_revision"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--runtime", default=None)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        result = reconcile(root, runtime)
        print(json.dumps({"ok": True, **result}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
