#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Capture and register a controller-owned full content-hash baseline snapshot."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib import ContractError, append_jsonl, canonical_hash, canonical_relative, now_utc, require_string, root_runtime, sha256_file, snapshot_workspace, write_json_atomic


def capture(root: Path, output: Path, *, story_id: str, run_id: str, iteration: int, generation: int, baseline_commit: str) -> dict:
    root = root.resolve()
    output = output.resolve()
    try:
        output_relative = output.relative_to(root)
    except ValueError as exc:
        raise ContractError("snapshot output must be inside project root") from exc
    _, artifact_ref = canonical_relative(root, output_relative, allow_new=True)
    files = snapshot_workspace(root)
    created_at = now_utc()
    snapshot_id = f"SNAP-{story_id}-{run_id}-{iteration}-{generation}"
    snapshot = {
        "schema_version": "1.0",
        "snapshot_id": snapshot_id,
        "story_id": story_id,
        "run_id": require_string(run_id, "run_id"),
        "iteration": iteration,
        "generation": generation,
        "baseline_commit": require_string(baseline_commit, "baseline_commit"),
        "created_at": created_at,
        "self_path": artifact_ref,
        "files": files,
        "file_map_fingerprint": canonical_hash(files),
        "artifact_ref": artifact_ref,
    }
    write_json_atomic(output, snapshot)
    artifact_sha256 = sha256_file(output)
    runtime = root_runtime(root)
    registry_path = runtime / "baseline-snapshots.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.exists() else {"schema_version": "1.0", "snapshots": {}}
    registry.setdefault("snapshots", {})[snapshot_id] = {
        "snapshot_id": snapshot_id,
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "baseline_commit": baseline_commit,
        "created_at": created_at,
        "artifact_ref": artifact_ref,
        "artifact_sha256": artifact_sha256,
        "file_map_fingerprint": snapshot["file_map_fingerprint"],
    }
    write_json_atomic(registry_path, registry)
    evidence_id = f"EV-SNAPSHOT-{story_id}-{run_id}-{iteration}-{generation}"
    ledger = runtime / "evidence-ledger.jsonl"
    append_jsonl(ledger, {
        "evidence_id": evidence_id,
        "kind": "BASELINE_SNAPSHOT",
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "artifact_ref": artifact_ref,
        "artifact_sha256": artifact_sha256,
        "file_map_fingerprint": snapshot["file_map_fingerprint"],
        "status": "PASS",
        "producer": "capture_snapshot",
        "gate": "SCOPE_BASELINE",
        "timestamp": created_at,
    })
    return {"status": "PASS", "snapshot_id": snapshot_id, "artifact_ref": artifact_ref, "artifact_sha256": artifact_sha256, "file_count": len(files)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--baseline-commit", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(capture(args.project_root, args.output, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, baseline_commit=args.baseline_commit), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
