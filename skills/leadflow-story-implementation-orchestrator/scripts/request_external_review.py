#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Create one controller-owned external review request when independence is unavailable."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import ContractError, append_jsonl, canonical_hash, canonical_relative, ensure_story_in_state, load_json, now_utc, root_runtime, validate_state_shape, write_bytes_atomic, write_json_atomic


def _inside(root: Path, path: Path, *, must_exist: bool = False) -> str:
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("external review path must be inside project root") from exc
    _, normalized = canonical_relative(root, relative, allow_new=not must_exist)
    if must_exist and not path.exists():
        raise ContractError(f"missing external review artifact: {normalized}")
    return normalized


def request(
    root: Path,
    state_path: Path,
    ledger_path: Path,
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    bundle_path: Path,
    result_path: Path,
    request_path: Path,
) -> dict[str, Any]:
    root = root.resolve()
    runtime = root_runtime(root)
    if state_path.resolve() != (runtime / "state.json").resolve():
        raise ContractError("external review state path must be the implementation runtime state")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    if story.get("status") != "REVIEWING":
        raise ContractError("external review request requires REVIEWING state")
    bundle_ref = _inside(root, bundle_path.resolve(), must_exist=True)
    result_ref = _inside(root, result_path.resolve())
    request_ref = _inside(root, request_path.resolve())
    if request_path.exists():
        raise ContractError("external review request already exists")
    if story.get("external_review_request", {}).get("status") == "AWAITING_EXTERNAL_REVIEW":
        raise ContractError("a single external review request is already pending")
    if result_path.exists():
        raise ContractError("external review result path must be empty before request")
    created_at = now_utc()
    prompt = (
        "Act as the independent reviewer for the immutable bundle at "
        f"{bundle_ref}. Do not modify the repository. Return only the structured "
        f"review-result JSON required by the bundle and save it at {result_ref}."
    )
    request_payload: dict[str, Any] = {
        "schema_version": "1.0",
        "request_id": f"REQ-REVIEW-{story_id}-{run_id}-{iteration}-{generation}",
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "bundle_ref": bundle_ref,
        "expected_result_ref": result_ref,
        "single_request": True,
        "status": "AWAITING_EXTERNAL_REVIEW",
        "created_at": created_at,
        "prompt": prompt,
    }
    request_payload["request_fingerprint"] = canonical_hash(request_payload)
    event = {
        "evidence_id": f"EV-EXTERNAL-REVIEW-REQUEST-{story_id}-{run_id}-{iteration}-{generation}",
        "kind": "EXTERNAL_REVIEW_REQUEST",
        "status": "REQUESTED",
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "producer": "request_external_review",
        "gate": "AWAITING_EXTERNAL_REVIEW",
        "artifact_ref": request_ref,
        "request_fingerprint": request_payload["request_fingerprint"],
        "timestamp": created_at,
    }
    event["result_fingerprint"] = canonical_hash(event)
    state_before = state_path.read_bytes()
    ledger_before = ledger_path.read_bytes() if ledger_path.exists() else None
    try:
        request_path.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(request_path, request_payload)
        story["status"] = "AWAITING_EXTERNAL_REVIEW"
        story["external_review_request"] = {
            "request_id": request_payload["request_id"],
            "request_ref": request_ref,
            "bundle_ref": bundle_ref,
            "expected_result_ref": result_ref,
            "request_fingerprint": request_payload["request_fingerprint"],
            "status": "AWAITING_EXTERNAL_REVIEW",
        }
        story["last_transition"] = {"from": "REVIEWING", "to": "AWAITING_EXTERNAL_REVIEW", "reason": "independent reviewer unavailable", "timestamp": created_at}
        state["revision"] = int(state.get("revision", 0)) + 1
        state["runtime_status"] = "RUNNING"
        state["active_story_id"] = story_id
        write_json_atomic(state_path, state)
        append_jsonl(ledger_path, event)
    except Exception as exc:
        try:
            write_bytes_atomic(state_path, state_before)
            if ledger_before is None:
                if ledger_path.exists():
                    ledger_path.unlink()
            else:
                write_bytes_atomic(ledger_path, ledger_before)
            if request_path.exists():
                request_path.unlink()
        except Exception as restore_exc:
            raise ContractError(f"external review request failed and rollback failed: {restore_exc}") from exc
        raise ContractError(f"external review request rolled back: {exc}") from exc
    return {"status": "PASS", "state": "AWAITING_EXTERNAL_REVIEW", "request": request_payload, "evidence_id": event["evidence_id"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--result", required=True, type=Path)
    parser.add_argument("--request", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(request(args.project_root, args.state, args.ledger, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, bundle_path=args.bundle, result_path=args.result, request_path=args.request), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
