#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Reopen an exclusively controller-owned integrity block without a new generation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    append_jsonl,
    canonical_hash,
    canonical_relative,
    ensure_story_in_state,
    load_json,
    now_utc,
    require_string,
    root_runtime,
    validate_result_provenance,
    validate_required_frozen_artifacts,
    validate_state_shape,
    verify_result_fingerprint,
    write_bytes_atomic,
    write_json_atomic,
)


INTEGRITY_BLOCK_KINDS = {
    "BUNDLE",
    "SCHEMA",
    "FINGERPRINT",
    "PROVENANCE_METADATA",
    "PROJECTION_RECONCILIATION",
    "LEDGER_RECONCILIATION",
    "REVIEW_ARTIFACT",
}
FROZEN_NAMES = {"story_execution_type.json", "validation-plan.json", "scope-manifest.json"}


def _relative(root: Path, path: Path, *, allow_new: bool = False) -> str:
    try:
        raw = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("integrity artifact must be inside project root") from exc
    _, relative = canonical_relative(root, raw, allow_new=allow_new)
    return relative


def _parse_replacement(root: Path, value: str) -> tuple[Path, Path, str, str]:
    if "=" not in value:
        raise ContractError("replacement must use target=source")
    target_raw, source_raw = value.split("=", 1)
    target = Path(target_raw).resolve()
    source = Path(source_raw).resolve()
    target_ref = _relative(root, target, allow_new=False)
    source_ref = _relative(root, source, allow_new=False)
    runtime_ref = root_runtime(root).relative_to(root).as_posix()
    if not target_ref.startswith(runtime_ref + "/") or not source_ref.startswith(runtime_ref + "/"):
        raise ContractError("integrity recovery may replace only runtime-owned artifacts")
    if target.name in FROZEN_NAMES:
        raise ContractError("frozen planning artifacts require the existing freeze controller")
    if target == source:
        raise ContractError("replacement source and target must differ")
    return target, source, target_ref, source_ref


def _validate_preserved_result(root: Path, ledger_path: Path, result_path: Path, expected: dict[str, Any], frozen: dict[str, Any]) -> None:
    result = load_json(result_path)
    provenance = result.get("provenance")
    if not isinstance(provenance, dict):
        raise ContractError(f"preserved result is missing provenance: {result_path}")
    verify_result_fingerprint(result)
    producer = require_string(provenance.get("producer"), "preserved result producer")
    gate = require_string(provenance.get("gate"), "preserved result gate")
    validate_result_provenance(root, result, result_path, expected_producer=producer, expected_gate=gate, expected_frozen_artifacts=frozen, ledger_path=ledger_path, **expected)
    workspace_seen = result.get("workspace_fingerprint")
    if workspace_seen is not None:
        from lib import workspace_fingerprint

        if workspace_seen != workspace_fingerprint(root):
            raise ContractError(f"preserved result workspace is stale: {result_path}")


def _validate_replacement_context(path: Path, expected: dict[str, Any]) -> dict[str, Any] | None:
    if path.suffix.lower() != ".json":
        return None
    value = load_json(path)
    if not isinstance(value, dict):
        raise ContractError(f"replacement JSON must be an object: {path}")
    context_keys = ("story_id", "run_id", "iteration", "generation", "input_fingerprint", "story_fingerprint")
    present = False
    for key in context_keys:
        if key in value:
            present = True
            if value.get(key) != expected[key]:
                raise ContractError(f"replacement context mismatch for {key}: {path}")
    if path.name.startswith("external-review-request"):
        if not present or not isinstance(value.get("request_fingerprint"), str):
            raise ContractError(f"external review request replacement lacks generation-scoped provenance: {path}")
    return value


def resume(
    root: Path,
    state_path: Path,
    ledger_path: Path,
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    block_kind: str,
    target_state: str,
    replacements: list[str],
    preserved_results: list[Path],
    input_fingerprint: str | None = None,
    story_fingerprint: str | None = None,
) -> dict[str, Any]:
    root = root.resolve()
    runtime = root_runtime(root)
    if state_path.resolve() != (runtime / "state.json").resolve():
        raise ContractError("integrity recovery state path must be the implementation runtime state")
    if block_kind not in INTEGRITY_BLOCK_KINDS:
        raise ContractError("unsupported integrity block kind")
    if target_state not in {"REVIEWING", "AWAITING_EXTERNAL_REVIEW"}:
        raise ContractError("integrity recovery target must be REVIEWING or AWAITING_EXTERNAL_REVIEW")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    if story.get("status") != "ESCALATED":
        raise ContractError("integrity recovery requires ESCALATED state")
    if story.get("run_id") not in {None, run_id} or story.get("generation") not in {None, generation}:
        raise ContractError("integrity recovery run or generation mismatch")
    original_generation = story.get("generation")
    original_repair_round = story.get("repair_round")
    parsed = [_parse_replacement(root, value) for value in replacements]
    if not parsed:
        raise ContractError("integrity recovery requires at least one affected controller artifact")
    if input_fingerprint is not None and story.get("input_fingerprint") not in {None, input_fingerprint}:
        raise ContractError("integrity recovery input fingerprint mismatch")
    if story_fingerprint is not None and story.get("story_fingerprint") not in {None, story_fingerprint}:
        raise ContractError("integrity recovery story fingerprint mismatch")
    frozen: dict[str, Any] | None = None
    replacement_values: dict[Path, dict[str, Any] | None] = {}
    if input_fingerprint and story_fingerprint:
        frozen = validate_required_frozen_artifacts(root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation, input_fingerprint=input_fingerprint, story_fingerprint=story_fingerprint)
        expected = {"story_id": story_id, "run_id": run_id, "iteration": iteration, "generation": generation, "input_fingerprint": input_fingerprint, "story_fingerprint": story_fingerprint}
        replacement_values = {source: _validate_replacement_context(source, expected) for _, source, _, _ in parsed}
        for preserved in preserved_results:
            _validate_preserved_result(root, ledger_path, preserved.resolve(), expected, frozen)
    elif preserved_results:
        raise ContractError("preserved results require input and story fingerprints")
    created_at = now_utc()
    history: list[dict[str, str]] = []
    state_before = state_path.read_bytes()
    ledger_before = ledger_path.read_bytes() if ledger_path.exists() else None
    file_before: dict[Path, bytes | None] = {}
    try:
        for target, source, target_ref, source_ref in parsed:
            file_before[target] = target.read_bytes() if target.exists() else None
            history_path = target.with_name(f"{target.name}.invalid.{created_at.replace(':', '').replace('-', '')}")
            if history_path.exists():
                raise ContractError(f"invalid artifact history path already exists: {history_path}")
            write_bytes_atomic(history_path, file_before[target] or b"")
            write_bytes_atomic(target, source.read_bytes())
            history.append({"invalid_ref": _relative(root, history_path, allow_new=False), "replacement_ref": target_ref, "source_ref": source_ref})
            replacement_value = replacement_values.get(source)
            if target.name.startswith("external-review-request") and isinstance(replacement_value, dict):
                story["external_review_request"] = {
                    "request_id": replacement_value["request_id"],
                    "request_ref": target_ref,
                    "bundle_ref": replacement_value["bundle_ref"],
                    "expected_result_ref": replacement_value["expected_result_ref"],
                    "request_fingerprint": replacement_value["request_fingerprint"],
                    "status": replacement_value["status"],
                }
        event: dict[str, Any] = {
            "evidence_id": f"EV-INTEGRITY-RESUME-{story_id}-{run_id}-{iteration}-{generation}",
            "kind": "RESUME_FROM_INTEGRITY_BLOCK",
            "status": "PASS",
            "story_id": story_id,
            "run_id": run_id,
            "iteration": iteration,
            "generation": generation,
            "block_kind": block_kind,
            "target_state": target_state,
            "superseded_artifacts": history,
            "preserved_results": [_relative(root, path.resolve(), allow_new=False) for path in preserved_results],
            "producer": "resume_from_integrity_block",
            "gate": "INTEGRITY_RECOVERY",
            "timestamp": created_at,
        }
        event["result_fingerprint"] = canonical_hash(event)
        story["status"] = target_state
        story["last_transition"] = {"from": "ESCALATED", "to": target_state, "reason": f"controller-only integrity recovery: {block_kind}", "timestamp": created_at}
        if original_generation != story.get("generation") or original_repair_round != story.get("repair_round"):
            raise ContractError("integrity recovery changed generation or repair round")
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
            for target, before in file_before.items():
                if before is None:
                    if target.exists():
                        target.unlink()
                else:
                    write_bytes_atomic(target, before)
            for item in history:
                path = root / item["invalid_ref"]
                if path.exists():
                    path.unlink()
        except Exception as restore_exc:
            raise ContractError(f"integrity recovery failed and rollback failed: {restore_exc}") from exc
        raise ContractError(f"integrity recovery rolled back: {exc}") from exc
    return {"status": "PASS", "story_id": story_id, "state": target_state, "generation": story.get("generation"), "repair_round": story.get("repair_round"), "history": history, "evidence_id": event["evidence_id"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--block-kind", required=True, choices=sorted(INTEGRITY_BLOCK_KINDS))
    parser.add_argument("--target-state", choices=["REVIEWING", "AWAITING_EXTERNAL_REVIEW"], required=True)
    parser.add_argument("--replacement", action="append", required=True, help="runtime target=runtime replacement source")
    parser.add_argument("--preserve-result", action="append", type=Path, default=[])
    parser.add_argument("--input-fingerprint")
    parser.add_argument("--story-fingerprint")
    args = parser.parse_args()
    try:
        print(json.dumps(resume(args.project_root, args.state, args.ledger, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, block_kind=args.block_kind, target_state=args.target_state, replacements=args.replacement, preserved_results=args.preserve_result, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
