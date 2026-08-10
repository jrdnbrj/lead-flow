#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Explicitly import a manually approved readiness baseline into state.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    append_jsonl,
    WORKFLOW,
    atomic_write_json,
    blank_story,
    canonical_hash,
    default_runtime,
    discover_story_files,
    extract_dependencies,
    fingerprint_reference,
    now_utc,
    evidence_index,
    relative_path,
    sha256_file,
    story_sort_key,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--epic", required=True, help="Epic ID, for example E4")
    parser.add_argument("--baseline", required=True, help="Explicit MANUAL_BASELINE_IMPORT JSON")
    parser.add_argument("--runtime", help="Runtime orchestration directory")
    parser.add_argument("--story-dir", default="_bmad-output/implementation-artifacts")
    parser.add_argument("--pilot-story-id", default=None)
    return parser.parse_args()


def validate_baseline(baseline: dict[str, Any]) -> None:
    required = ("schema_version", "import_id", "origin", "approved_by", "approved_at", "stories")
    missing = [field for field in required if not baseline.get(field)]
    if missing:
        raise ContractError(f"baseline missing required fields: {', '.join(missing)}")
    if baseline["schema_version"] != "1.0":
        raise ContractError("baseline schema_version must be 1.0")
    if baseline["origin"] != "MANUAL_BASELINE_IMPORT":
        raise ContractError("baseline origin must be MANUAL_BASELINE_IMPORT")
    if not isinstance(baseline["stories"], list) or not baseline["stories"]:
        raise ContractError("baseline stories must be a non-empty array")
    seen: set[str] = set()
    for entry in baseline["stories"]:
        if not isinstance(entry, dict):
            raise ContractError("every baseline story must be an object")
        story_id = entry.get("story_id")
        if not isinstance(story_id, str) or story_id in seen:
            raise ContractError(f"invalid or duplicate baseline story_id: {story_id}")
        seen.add(story_id)
        if entry.get("status") != "READY_FOR_DEV":
            raise ContractError(f"baseline status for {story_id} must be READY_FOR_DEV")
        if not entry.get("evidence_refs") or not isinstance(entry["evidence_refs"], list):
            raise ContractError(f"{story_id}: evidence_refs are required")
        if not entry.get("source_refs") or not isinstance(entry["source_refs"], list):
            raise ContractError(f"{story_id}: source_refs are required")
        if entry.get("dependencies_checked") is not True:
            raise ContractError(f"{story_id}: dependencies_checked must be true")


def build_state(root: Path, runtime: Path, epic: str, baseline: dict[str, Any], story_dir: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    validate_baseline(baseline)
    story_files = discover_story_files(root, story_dir, epic)
    story_map: dict[str, dict[str, Any]] = {}
    for story_id, path in story_files.items():
        story_map[story_id] = blank_story(root, story_id, path, extract_dependencies(path))

    baseline_by_id = {entry["story_id"]: entry for entry in baseline["stories"]}
    unknown = sorted(set(baseline_by_id) - set(story_map), key=story_sort_key)
    if unknown:
        raise ContractError(f"baseline references stories not found: {', '.join(unknown)}")

    imported_ids = set(baseline_by_id)
    for story_id in sorted(imported_ids, key=story_sort_key):
        story = story_map[story_id]
        missing = [dependency for dependency in story["dependencies"] if dependency not in imported_ids]
        if missing:
            raise ContractError(
                f"cannot prove dependency chain for {story_id}; missing explicit baseline: {', '.join(missing)}"
            )

    imported_at = now_utc()
    evidence_entries: list[dict[str, Any]] = []
    for story_id in sorted(imported_ids, key=story_sort_key):
        entry = baseline_by_id[story_id]
        story = story_map[story_id]
        evidence_id = f"EV-BASELINE-{story_id}-001"
        source_fingerprints = [
            fingerprint_reference(root, reference, kind="authoritative")
            for reference in entry["source_refs"]
        ]
        evidence_fingerprints = [
            fingerprint_reference(root, reference, kind="validation_reference")
            for reference in entry["evidence_refs"]
        ]
        dependency_fingerprints = [
            {
                "story_id": dependency,
                "sha256": story_map[dependency]["fingerprint"]["value"],
            }
            for dependency in story["dependencies"]
        ]
        story.update(
            {
                "status": "READY_FOR_DEV",
                "current_gate": "MANUAL_BASELINE_IMPORT",
                "last_result": {
                    "gate": "MANUAL_BASELINE_IMPORT",
                    "verdict": "PASS",
                    "iteration": 0,
                    "source": "MANUAL_BASELINE_IMPORT",
                    "import_id": baseline["import_id"],
                    "timestamp": imported_at,
                    "evidence_refs": [evidence_id],
                },
                "timestamps": {
                    **story["timestamps"],
                    "updated_at": imported_at,
                    "last_gate_at": imported_at,
                    "last_pass_at": imported_at,
                },
                "authoritative_fingerprints": source_fingerprints,
                "validation_reference_fingerprints": evidence_fingerprints,
                "dependency_fingerprints": dependency_fingerprints,
                "evidence_refs": [evidence_id],
                "baseline_import": {
                    "import_id": baseline["import_id"],
                    "origin": "MANUAL_BASELINE_IMPORT",
                    "approved_by": baseline["approved_by"],
                    "approved_at": baseline["approved_at"],
                    "evidence_refs": entry["evidence_refs"],
                    "source_refs": entry["source_refs"],
                    "dependencies_checked": True,
                    "imported_at": imported_at,
                },
            }
        )
        evidence_entries.append(
            {
                "evidence_id": evidence_id,
                "story": story_id,
                "gate": "MANUAL_BASELINE_IMPORT",
                "iteration": 0,
                "input_artifact": "bootstrap/manual-baseline.json",
                "reviewer_result": "bootstrap/manual-baseline.json",
                "blockers": [],
                "resolution": ["Explicit baseline import with dependency closure verified."],
                "timestamp": imported_at,
                "final_verdict": "PASS",
                "metadata": {
                    "origin": "MANUAL_BASELINE_IMPORT",
                    "approved_by": baseline["approved_by"],
                    "source_fingerprint_count": len(source_fingerprints),
                    "validation_reference_count": len(evidence_fingerprints),
                    "dependency_fingerprint_count": len(dependency_fingerprints),
                },
            }
        )

    state = {
        "schema_version": "1.0",
        "workflow": WORKFLOW,
        "epic": epic,
        "state_revision": 1,
        "pilot_story_id": baseline.get("pilot_story_id"),
        "bootstrap_import": {
            "import_id": baseline["import_id"],
            "origin": "MANUAL_BASELINE_IMPORT",
            "approved_by": baseline["approved_by"],
            "approved_at": baseline["approved_at"],
            "imported_at": imported_at,
            "baseline_sha256": canonical_hash(baseline),
        },
        "stories": [story_map[story_id] for story_id in sorted(story_map, key=story_sort_key)],
    }
    return state, evidence_entries


def main() -> int:
    args = parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
        if args.pilot_story_id:
            baseline["pilot_story_id"] = args.pilot_story_id
        state_path = runtime / "state.json"
        if state_path.exists():
            raise ContractError(f"state already exists; refusing overwrite: {relative_path(root, state_path)}")
        state, evidence_entries = build_state(root, runtime, args.epic, baseline, args.story_dir)
        atomic_write_json(state_path, state)
        evidence_path = runtime / "evidence-ledger.jsonl"
        for entry in evidence_entries:
            append_jsonl(evidence_path, entry)
        atomic_write_json(runtime / "evidence-index.json", evidence_index(evidence_path))
        print(json.dumps({
            "ok": True,
            "operation": "MANUAL_BASELINE_IMPORT",
            "state": relative_path(root, state_path),
            "imported": sorted([entry["story_id"] for entry in baseline["stories"]], key=story_sort_key),
            "evidence_entries": len(evidence_entries),
        }, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
