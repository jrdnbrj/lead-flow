#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Compare registered baseline snapshots and enforce a registered frozen scope manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    append_jsonl,
    attach_provenance,
    canonical_hash,
    canonical_relative,
    load_json,
    load_frozen_registry,
    now_utc,
    root_runtime,
    sha256_file,
    snapshot_workspace,
    validate_registered_frozen_artifact,
    validate_required_frozen_artifacts,
    verify_fingerprint,
    write_json_atomic,
)


def _registry_snapshot(root: Path, snapshot_path: Path, expected: dict[str, Any]) -> dict[str, Any]:
    snapshot = load_json(snapshot_path)
    required = {"snapshot_id", "story_id", "run_id", "iteration", "generation", "baseline_commit", "created_at", "files", "file_map_fingerprint", "artifact_ref"}
    if not required.issubset(snapshot):
        raise ContractError("baseline snapshot is missing provenance fields")
    for key in ("story_id", "run_id", "iteration", "generation"):
        if snapshot.get(key) != expected[key]:
            raise ContractError(f"baseline snapshot mismatch for {key}")
    if snapshot["file_map_fingerprint"] != canonical_hash(snapshot["files"]):
        raise ContractError("baseline file map fingerprint mismatch")
    _, relative = canonical_relative(root, snapshot_path.resolve().relative_to(root.resolve()), allow_new=False)
    if snapshot["artifact_ref"] != relative:
        raise ContractError("baseline artifact reference mismatch")
    registry_path = root_runtime(root) / "baseline-snapshots.json"
    registry = load_json(registry_path)
    entry = registry.get("snapshots", {}).get(snapshot["snapshot_id"]) if isinstance(registry, dict) else None
    if not isinstance(entry, dict):
        raise ContractError("baseline snapshot is not registered")
    if entry.get("artifact_ref") != relative or entry.get("artifact_sha256") != sha256_file(snapshot_path):
        raise ContractError("registered baseline snapshot hash/reference mismatch")
    for key in ("story_id", "run_id", "iteration", "generation", "baseline_commit", "file_map_fingerprint"):
        if entry.get(key) != snapshot.get(key):
            raise ContractError(f"registered baseline mismatch for {key}")
    return snapshot


def _prefix_match(path: str, prefixes: list[dict[str, Any]]) -> dict[str, Any] | None:
    matches = [item for item in prefixes if path == item["path"] or path.startswith(item["path"].rstrip("/") + "/")]
    if len(matches) > 1:
        raise ContractError(f"path matches multiple frozen prefixes: {path}")
    return matches[0] if matches else None


def evaluate(
    root: Path,
    baseline: dict[str, Any],
    manifest: dict[str, Any],
    actor: str,
    *,
    manifest_path: Path,
    snapshot_path: Path,
    expected: dict[str, Any],
) -> dict[str, Any]:
    if actor not in {"DEV", "FIXER", "CONTROLLER"}:
        raise ContractError("actor must be DEV, FIXER or CONTROLLER")
    frozen_manifest = validate_registered_frozen_artifact(
        root,
        manifest_path,
        expected_kind="scope_manifest",
        expected_story_id=expected["story_id"],
        expected_run_id=expected["run_id"],
        expected_iteration=expected["iteration"],
        expected_generation=expected["generation"],
        expected_input_fingerprint=expected["input_fingerprint"],
        expected_story_fingerprint=expected["story_fingerprint"],
    )
    if manifest.get("fingerprint") != frozen_manifest["fingerprint"]:
        raise ContractError("provided scope manifest is not the registered frozen manifest")
    registered_baseline = _registry_snapshot(root, snapshot_path, expected)
    if baseline != registered_baseline:
        raise ContractError("provided baseline does not equal the registered controller snapshot")
    baseline = registered_baseline
    before = baseline.get("files")
    if not isinstance(before, dict):
        raise ContractError("baseline snapshot files must be an object")
    after = snapshot_workspace(root)
    current_fingerprint = canonical_hash(after)
    changed = sorted({*before, *after} - {path for path in set(before) & set(after) if before[path] == after[path]})
    if baseline.get("self_path") in changed:
        changed.remove(baseline["self_path"])
    entries = {item["path"]: item for item in manifest.get("path_classification", [])}
    prefixes = manifest.get("path_prefixes_allowed", [])
    if not isinstance(prefixes, list) or not all(isinstance(item, dict) and {"path", "category", "justification"}.issubset(item) for item in prefixes):
        raise ContractError("frozen path prefixes must preserve path, category and justification")
    failures: list[str] = []
    classifications: list[dict[str, str]] = []
    for path in changed:
        _, canonical = canonical_relative(root, path, allow_new=False)
        item = entries.get(canonical) or _prefix_match(canonical, prefixes)
        category = item.get("category") if item else None
        classifications.append({"path": canonical, "category": category or "UNKNOWN"})
        allowed = (actor == "DEV" and category == "DEV_WRITABLE") or (actor == "FIXER" and category == "FIXER_WRITABLE") or (actor == "CONTROLLER" and category == "CONTROLLER_ONLY")
        if not allowed:
            failures.append(f"SCOPE_DRIFT: {canonical} category={category or 'UNKNOWN'} actor={actor}")
    return {
        "status": "PASS" if not failures else "FAIL",
        "changed_paths": classifications,
        "failures": failures,
        "manifest_fingerprint": frozen_manifest["fingerprint"],
        "workspace_fingerprint": current_fingerprint,
        "checked_at": now_utc(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--actor", required=True, choices=["DEV", "FIXER", "CONTROLLER"])
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    parser.add_argument("--gate", choices=["SCOPE_GATE", "FINAL_SCOPE_GATE"], default="SCOPE_GATE")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    args = parser.parse_args()
    try:
        root = args.project_root.resolve()
        expected = {
            "story_id": args.story_id,
            "run_id": args.run_id,
            "iteration": args.iteration,
            "generation": args.generation,
            "input_fingerprint": args.input_fingerprint,
            "story_fingerprint": args.story_fingerprint,
        }
        result = evaluate(root, load_json(args.baseline), load_json(args.manifest), args.actor, manifest_path=args.manifest.resolve(), snapshot_path=args.baseline.resolve(), expected=expected)
        frozen = validate_required_frozen_artifacts(root, **expected)
        output_relative = args.output.resolve().relative_to(root)
        ledger_relative = args.ledger.resolve().relative_to(root)
        refs = [f"EV-{args.gate}-{args.story_id}-{args.run_id}-{args.iteration}-{args.generation}"]
        result = attach_provenance(result, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint, frozen_artifacts=frozen, evidence_ledger=ledger_relative.as_posix(), evidence_refs=refs, producer="scope_gate", gate=args.gate, result_artifact_ref=output_relative.as_posix())
        write_json_atomic(args.output, result)
        append_jsonl(args.ledger, {"evidence_id": refs[0], "story_id": args.story_id, "run_id": args.run_id, "iteration": args.iteration, "generation": args.generation, "input_fingerprint": args.input_fingerprint, "story_fingerprint": args.story_fingerprint, "producer": "scope_gate", "gate": args.gate, "artifact_ref": output_relative.as_posix(), "result_fingerprint": result["provenance"]["result_fingerprint"], "frozen_artifacts": frozen, "status": result["status"], "workspace_fingerprint": result["workspace_fingerprint"], "timestamp": result["checked_at"]})
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0 if result["status"] == "PASS" else 1
    except (ContractError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
