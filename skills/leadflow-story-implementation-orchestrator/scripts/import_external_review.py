#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Import one structured external review result and resume the bounded lifecycle."""

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
    ensure_story_in_state,
    load_json,
    now_utc,
    read_jsonl,
    require_string,
    result_fingerprint,
    root_runtime,
    validate_required_frozen_artifacts,
    validate_state_shape,
    verify_result_fingerprint,
    workspace_fingerprint,
    write_bytes_atomic,
    write_json_atomic,
)
from lib import _validate_review_type  # type: ignore[attr-defined]


def _relative(root: Path, path: Path, *, allow_new: bool = False) -> str:
    try:
        raw = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("external review artifact must be inside project root") from exc
    _, relative = canonical_relative(root, raw, allow_new=allow_new)
    return relative


def _validate_external_result(raw: dict[str, Any], *, expected: dict[str, Any], frozen: dict[str, Any], root: Path) -> None:
    if raw.get("status") not in {"PASS", "FAIL", "DECISION_REQUIRED", "ESCALATE"}:
        raise ContractError("external review status is invalid")
    for key, value in expected.items():
        if raw.get(key) != value:
            raise ContractError(f"external review mismatch for {key}")
    provenance = raw.get("provenance")
    if not isinstance(provenance, dict):
        raise ContractError("external review provenance is missing")
    for key, value in expected.items():
        if provenance.get(key) != value:
            raise ContractError(f"external review provenance mismatch for {key}")
    if provenance.get("frozen_artifacts") != frozen:
        raise ContractError("external review frozen artifact provenance mismatch")
    verify_result_fingerprint(raw)
    _validate_review_type(root, raw, frozen)
    if not isinstance(raw.get("findings", []), list):
        raise ContractError("external review findings must be an array")
    if not isinstance(raw.get("workspace_fingerprint"), str):
        raise ContractError("external review must include workspace_fingerprint")
    if not isinstance(raw.get("checked_at"), str):
        raise ContractError("external review must include checked_at")


def import_review(
    root: Path,
    state_path: Path,
    ledger_path: Path,
    *,
    input_path: Path,
    output_path: Path,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
) -> dict[str, Any]:
    root = root.resolve()
    runtime = root_runtime(root)
    if state_path.resolve() != (runtime / "state.json").resolve():
        raise ContractError("external review state path must be the implementation runtime state")
    input_ref = _relative(root, input_path.resolve(), allow_new=False)
    output_ref = _relative(root, output_path.resolve(), allow_new=True)
    if output_path.exists():
        raise ContractError("imported external review output already exists")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    if story.get("status") != "AWAITING_EXTERNAL_REVIEW":
        raise ContractError("external review import requires AWAITING_EXTERNAL_REVIEW")
    request = story.get("external_review_request")
    if not isinstance(request, dict) or request.get("status") != "AWAITING_EXTERNAL_REVIEW":
        raise ContractError("pending external review request is missing")
    raw = load_json(input_path)
    if not isinstance(raw, dict):
        raise ContractError("external review result must be an object")
    frozen = validate_required_frozen_artifacts(root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation, input_fingerprint=input_fingerprint, story_fingerprint=story_fingerprint)
    expected = {"story_id": story_id, "run_id": run_id, "iteration": iteration, "generation": generation, "input_fingerprint": input_fingerprint, "story_fingerprint": story_fingerprint}
    _validate_external_result(raw, expected=expected, frozen=frozen, root=root)
    imported_at = now_utc()
    payload = dict(raw)
    payload.pop("provenance", None)
    payload["imported_from"] = input_ref
    payload["external_result_fingerprint"] = raw["provenance"]["result_fingerprint"]
    payload["imported_at"] = imported_at
    evidence_id = f"EV-EXTERNAL-REVIEW-{story_id}-{run_id}-{iteration}-{generation}"
    result = attach_provenance(
        payload,
        story_id=story_id,
        run_id=run_id,
        iteration=iteration,
        generation=generation,
        input_fingerprint=input_fingerprint,
        story_fingerprint=story_fingerprint,
        frozen_artifacts=frozen,
        evidence_ledger=_relative(root, ledger_path.resolve(), allow_new=True),
        evidence_refs=[evidence_id],
        producer="independent_reviewer",
        gate="REVIEWING",
        result_artifact_ref=output_ref,
    )
    event = {
        "evidence_id": evidence_id,
        "kind": "EXTERNAL_REVIEW_IMPORTED",
        "status": result["status"],
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
        "producer": "independent_reviewer",
        "gate": "REVIEWING",
        "artifact_ref": output_ref,
        "result_fingerprint": result["provenance"]["result_fingerprint"],
        "external_result_fingerprint": raw["provenance"]["result_fingerprint"],
        "frozen_artifacts": frozen,
        "workspace_fingerprint": result["workspace_fingerprint"],
        "timestamp": imported_at,
    }
    event["import_fingerprint"] = canonical_hash(event)
    next_state = {
        "PASS": "REVIEWING",
        "FAIL": "NEEDS_TECHNICAL_FIX",
        "DECISION_REQUIRED": "NEEDS_USER_DECISION",
        "ESCALATE": "ESCALATED",
    }[result["status"]]
    state_before = state_path.read_bytes()
    ledger_before = ledger_path.read_bytes() if ledger_path.exists() else None
    try:
        write_json_atomic(output_path, result)
        story["status"] = next_state
        story["external_review_request"]["status"] = "IMPORTED"
        story["external_review_request"]["result_ref"] = output_ref
        story["external_review_request"]["result_fingerprint"] = raw["provenance"]["result_fingerprint"]
        story["last_transition"] = {"from": "AWAITING_EXTERNAL_REVIEW", "to": next_state, "reason": "external review imported", "timestamp": imported_at}
        state["revision"] = int(state.get("revision", 0)) + 1
        state["runtime_status"] = "BLOCKED" if next_state in {"NEEDS_USER_DECISION", "ESCALATED"} else "RUNNING"
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
            if output_path.exists():
                output_path.unlink()
        except Exception as restore_exc:
            raise ContractError(f"external review import failed and rollback failed: {restore_exc}") from exc
        raise ContractError(f"external review import rolled back: {exc}") from exc
    return {"status": result["status"], "next_state": next_state, "result_ref": output_ref, "evidence_id": evidence_id}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(import_review(args.project_root, args.state, args.ledger, input_path=args.input, output_path=args.output, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
