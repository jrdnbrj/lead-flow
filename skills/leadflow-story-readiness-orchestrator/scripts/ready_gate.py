#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Write READY_FOR_DEV only after every deterministic readiness precondition passes."""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    atomic_write_text,
    default_runtime,
    now_utc,
    parse_timestamp,
    project_bmad_status,
    read_jsonl,
    require_valid_state,
    resolve_path,
    sha256_bytes,
    sha256_file,
    state_stories,
    story_id_from_content,
    validate_state,
)
from resume_reconcile import reconcile


PASS_GATES = {"MANUAL_BASELINE_IMPORT", "VALIDATE", "TRIAGE", "REVALIDATING", "FINAL_REVALIDATION"}


def linked_pass_evidence(
    story: dict[str, Any],
    result: dict[str, Any],
    evidence_entries: list[dict[str, Any]],
    gate_started_at: str,
) -> list[dict[str, Any]]:
    story_refs = set(story.get("evidence_refs", []))
    result_refs = set(result.get("evidence_refs", []))
    if not story_refs or not result_refs:
        raise ContractError("last PASS requires non-empty story and result evidence_refs")
    linked_refs = story_refs & result_refs
    if not linked_refs:
        raise ContractError("last PASS evidence is not linked from both story and last_result")
    gate_started = parse_timestamp(gate_started_at)
    valid: list[dict[str, Any]] = []
    for entry in evidence_entries:
        if entry.get("evidence_id") not in linked_refs:
            continue
        if entry.get("story") != story.get("story_id"):
            continue
        if entry.get("gate") != result.get("gate"):
            continue
        if entry.get("iteration") != result.get("iteration"):
            continue
        if entry.get("final_verdict") != "PASS":
            continue
        try:
            registered_at = parse_timestamp(entry.get("timestamp"))
        except ContractError:
            continue
        if registered_at > gate_started:
            continue
        valid.append(entry)
    if not valid:
        raise ContractError(
            "no evidence PASS validamente vinculada al último gate/iteration antes de ready_gate"
        )
    if result.get("gate") == "MANUAL_BASELINE_IMPORT":
        if result.get("source") != "MANUAL_BASELINE_IMPORT":
            raise ContractError("MANUAL_BASELINE_IMPORT PASS must identify its explicit source")
        if story.get("baseline_import", {}).get("origin") != "MANUAL_BASELINE_IMPORT":
            raise ContractError("MANUAL_BASELINE_IMPORT PASS requires baseline_import origin")
        valid = [
            entry
            for entry in valid
            if entry.get("input_artifact") == "bootstrap/manual-baseline.json"
            and entry.get("metadata", {}).get("origin") == "MANUAL_BASELINE_IMPORT"
        ]
        if not valid:
            raise ContractError("MANUAL_BASELINE_IMPORT requires explicit bootstrap evidence")
    return valid


def next_evidence_id(entries: list[dict[str, Any]], story_id: str, revision: int) -> str:
    existing = {entry.get("evidence_id") for entry in entries}
    number = revision
    while True:
        candidate = f"EV-STATUS-PROJECTION-{story_id}-{number:03d}"
        if candidate not in existing:
            return candidate
        number += 1


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def evidence_index_value(entries: list[dict[str, Any]], rebuilt_at: str) -> dict[str, Any]:
    by_story: dict[str, list[str]] = {}
    for entry in entries:
        story_id = entry.get("story")
        evidence_id = entry.get("evidence_id")
        if isinstance(story_id, str) and isinstance(evidence_id, str):
            by_story.setdefault(story_id, []).append(evidence_id)
    return {"schema_version": "1.0", "entries": len(entries), "by_story": by_story, "rebuilt_at": rebuilt_at}


def restore_snapshot(path: Path, existed: bool, content: str) -> None:
    if existed:
        atomic_write_text(path, content)
    elif path.exists():
        path.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--runtime", default=None)
    parser.add_argument("--story-id", required=True)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    gate_started_at = now_utc()
    try:
        evidence_path = runtime / "evidence-ledger.jsonl"
        evidence_before_gate = read_jsonl(evidence_path)
        reconciliation = reconcile(root, runtime)
        state_path = runtime / "state.json"
        state = require_valid_state(state_path, root)
        state_original = state_path.read_text(encoding="utf-8")
        evidence_original_exists = evidence_path.exists()
        evidence_original = evidence_path.read_text(encoding="utf-8") if evidence_original_exists else ""
        index_path = runtime / "evidence-index.json"
        index_original_exists = index_path.exists()
        index_original = index_path.read_text(encoding="utf-8") if index_original_exists else ""
        stories = state_stories(state)
        if args.story_id not in stories:
            raise ContractError(f"unknown story_id: {args.story_id}")
        story = stories[args.story_id]
        if reconciliation.get("invalidated"):
            if any(item["story_id"] == args.story_id for item in reconciliation["invalidated"]):
                raise ContractError("story was invalidated during ready gate; revalidation required")
        result = story.get("last_result")
        if (
            not isinstance(result, dict)
            or result.get("verdict") != "PASS"
            or result.get("gate") not in PASS_GATES
            or not isinstance(result.get("iteration"), int)
        ):
            raise ContractError("last gate is not a valid PASS")
        if story.get("status") == "READY_FOR_DEV":
            raise ContractError("story is already READY_FOR_DEV; no implicit repeat")
        if story.get("blockers_open"):
            raise ContractError("open blockers remain")
        if story.get("decision_required"):
            raise ContractError("decision_required is true")
        if story.get("review_round", 99) > 2 or story.get("repair_round", 99) > 3:
            raise ContractError("loop limit exceeded")

        validation_evidence = linked_pass_evidence(story, result, evidence_before_gate, gate_started_at)

        story_path = resolve_path(root, story["story_file"])
        if not story_path.is_file() or sha256_file(story_path) != story["fingerprint"].get("value"):
            raise ContractError("story fingerprint does not match current artifact")
        original_content = story_path.read_text(encoding="utf-8")
        if story_id_from_content(original_content) != args.story_id:
            raise ContractError("story_id in story content does not match state story_id")
        for reference in story.get("authoritative_fingerprints", []):
            path = resolve_path(root, reference["path"])
            if not path.is_file() or sha256_file(path) != reference.get("sha256"):
                raise ContractError(f"authoritative input changed: {reference.get('path')}")
        for dependency in story.get("dependencies", []):
            dependency_story = stories[dependency]
            if dependency_story.get("status") != "READY_FOR_DEV":
                raise ContractError(f"dependency is not READY_FOR_DEV: {dependency}")
            stored = next((item for item in story.get("dependency_fingerprints", []) if item.get("story_id") == dependency), None)
            current_hash = sha256_file(resolve_path(root, dependency_story["story_file"]))
            if not stored or stored.get("sha256") != current_hash:
                raise ContractError(f"dependency fingerprint changed: {dependency}")

        validated_hash = sha256_file(story_path)
        projected_content, old_status = project_bmad_status(original_content, "ready-for-dev")
        final_hash = sha256_bytes(projected_content.encode("utf-8"))
        projection_timestamp = now_utc()
        current_evidence_entries = read_jsonl(evidence_path)
        projection_evidence_id = next_evidence_id(current_evidence_entries, args.story_id, state["state_revision"] + 1)
        projection_entry = {
            "evidence_id": projection_evidence_id,
            "story": args.story_id,
            "gate": "MARK_READY_FOR_DEV",
            "iteration": result["iteration"],
            "input_artifact": story["story_file"],
            "reviewer_result": "deterministic-status-projection",
            "blockers": [],
            "resolution": ["Controlled BMad Status projection after deterministic PASS gate."],
            "timestamp": projection_timestamp,
            "final_verdict": "PASS",
            "metadata": {
                "field": "Status",
                "from": old_status,
                "to": "ready-for-dev",
                "validated_hash": validated_hash,
                "final_hash": final_hash,
                "validation_evidence_refs": [entry["evidence_id"] for entry in validation_evidence],
                "controlled_transition": True,
            },
        }
        ledger_next = evidence_original
        if ledger_next and not ledger_next.endswith("\n"):
            ledger_next += "\n"
        ledger_next += json.dumps(projection_entry, ensure_ascii=False, sort_keys=True) + "\n"
        index_next = json_text(evidence_index_value([*current_evidence_entries, projection_entry], projection_timestamp))

        next_state = copy.deepcopy(state)
        next_story = state_stories(next_state)[args.story_id]
        next_story["status"] = "READY_FOR_DEV"
        next_story["current_gate"] = "MARK_READY_FOR_DEV"
        next_story["fingerprint"] = {"algorithm": "sha256", "value": final_hash, "captured_at": projection_timestamp}
        next_story["validation_fingerprint"] = {
            "algorithm": "sha256",
            "value": validated_hash,
            "captured_at": result["timestamp"],
        }
        next_story["status_projection"] = {
            "field": "Status",
            "from": old_status,
            "to": "ready-for-dev",
            "validated_hash": validated_hash,
            "final_hash": final_hash,
            "evidence_ref": projection_evidence_id,
            "timestamp": projection_timestamp,
        }
        next_story["last_result"]["validated_story_fingerprint"] = validated_hash
        next_story["last_result"]["final_story_fingerprint"] = final_hash
        next_story["evidence_refs"] = list(dict.fromkeys([*next_story.get("evidence_refs", []), projection_evidence_id]))
        for reference in next_story.get("authoritative_fingerprints", []):
            if reference.get("path") == next_story["story_file"]:
                reference["sha256"] = final_hash
        next_story.setdefault("timestamps", {})["updated_at"] = projection_timestamp
        next_story["timestamps"]["last_pass_at"] = projection_timestamp
        next_story["timestamps"]["last_gate_at"] = projection_timestamp
        next_state["state_revision"] += 1
        validation_errors = validate_state(next_state, root)
        if validation_errors:
            raise ContractError("ready transition would create invalid state: " + "; ".join(validation_errors))

        try:
            atomic_write_text(story_path, projected_content)
            if sha256_file(story_path) != final_hash:
                raise ContractError("projected story fingerprint mismatch")
            atomic_write_text(evidence_path, ledger_next)
            atomic_write_text(index_path, index_next)
            atomic_write_text(state_path, json_text(next_state))
            persisted_state = require_valid_state(state_path, root)
            persisted_story = state_stories(persisted_state)[args.story_id]
            if persisted_story.get("status") != "READY_FOR_DEV" or persisted_story.get("fingerprint", {}).get("value") != final_hash:
                raise ContractError("persisted state does not match READY_FOR_DEV projection")
            if not any(entry.get("evidence_id") == projection_evidence_id for entry in read_jsonl(evidence_path)):
                raise ContractError("persisted evidence ledger is missing status projection evidence")
        except Exception as commit_error:
            rollback_errors: list[str] = []
            for path, existed, content in (
                (story_path, True, original_content),
                (evidence_path, evidence_original_exists, evidence_original),
                (index_path, index_original_exists, index_original),
                (state_path, True, state_original),
            ):
                try:
                    restore_snapshot(path, existed, content)
                except Exception as rollback_error:
                    rollback_errors.append(f"{path}: {rollback_error}")
            detail = f"ready transition rolled back after persistence failure: {commit_error}"
            if rollback_errors:
                detail += "; rollback failures: " + ", ".join(rollback_errors)
            raise ContractError(detail) from commit_error

        print(json.dumps({
            "ok": True,
            "story_id": args.story_id,
            "status": "READY_FOR_DEV",
            "status_projection": {"from": old_status, "to": "ready-for-dev"},
            "validation_evidence": [entry["evidence_id"] for entry in validation_evidence],
            "projection_evidence": projection_evidence_id,
            "validated_hash": validated_hash,
            "final_hash": final_hash,
            "state_revision": next_state["state_revision"],
        }, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
