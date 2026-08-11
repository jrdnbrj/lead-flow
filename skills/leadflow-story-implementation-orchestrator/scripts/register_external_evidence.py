#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Register a controller-owned external evidence request before waiting for evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from import_external_evidence import _verify_request
from lib import ContractError, append_jsonl, canonical_hash, canonical_relative, load_json, now_utc, require_object, require_story_id, require_string, root_runtime, sha256_file, write_json_atomic


def register(
    root: Path,
    request_path: Path,
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    ledger_path: Path,
) -> dict:
    root = root.resolve()
    request_path = request_path.resolve()
    _, artifact_ref = canonical_relative(root, request_path.relative_to(root), allow_new=False)
    request = require_object(load_json(request_path), "external evidence request")
    request_story_id, request = _verify_request(request)
    expected = {
        "story_id": require_story_id(story_id),
        "run_id": require_string(run_id, "run_id"),
        "iteration": iteration,
        "generation": generation,
    }
    for key, value in expected.items():
        if request.get(key) != value or (key == "story_id" and request_story_id != value):
            raise ContractError(f"external evidence request mismatch for {key}")
    runtime = root_runtime(root)
    registry_path = runtime / "external-evidence-requests.json"
    registry = load_json(registry_path) if registry_path.exists() else {"schema_version": "1.0", "requests": {}}
    if not isinstance(registry, dict) or not isinstance(registry.get("requests"), dict):
        raise ContractError("invalid external evidence request registry")
    request_id = request["request_id"]
    if request_id in registry["requests"]:
        raise ContractError(f"external evidence request is already registered: {request_id}")
    created_at = now_utc()
    file_sha256 = sha256_file(request_path)
    ledger_ref = canonical_relative(root, ledger_path.resolve().relative_to(root), allow_new=True)[1]
    evidence_id = f"EV-EXTERNAL-REQUEST-{request_story_id}-{run_id}-{iteration}-{generation}"
    entry = {
        "request_id": request_id,
        "story_id": request_story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "artifact_ref": artifact_ref,
        "file_sha256": file_sha256,
        "request_fingerprint": request["fingerprint"],
        "created_at": created_at,
        "evidence_id": evidence_id,
        "ledger_ref": ledger_ref,
    }
    registry["requests"][request_id] = entry
    write_json_atomic(registry_path, registry)
    event = {
        "evidence_id": evidence_id,
        "kind": "EXTERNAL_EVIDENCE_REQUEST_REGISTERED",
        "status": "PASS",
        "producer": "register_external_evidence",
        "gate": "AWAITING_EXTERNAL_EVIDENCE",
        "story_id": request_story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "request_id": request_id,
        "artifact_ref": artifact_ref,
        "file_sha256": file_sha256,
        "request_fingerprint": request["fingerprint"],
        "created_at": created_at,
    }
    event["event_fingerprint"] = canonical_hash(event)
    append_jsonl(ledger_path, event)
    return {"status": "PASS", **entry}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--ledger", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(register(args.project_root, args.request, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, ledger_path=args.ledger), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
