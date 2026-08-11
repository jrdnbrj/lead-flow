#!/usr/bin/env python3
"""Start a new controller-owned generation after an evidenced terminal escalation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import ContractError, append_jsonl, canonical_hash, canonical_relative, ensure_story_in_state, load_json, now_utc, read_jsonl, root_runtime, validate_state_shape, write_bytes_atomic, write_json_atomic


def _restore(path: Path, before: bytes | None) -> None:
    if before is None:
        if path.exists():
            path.unlink()
    else:
        write_bytes_atomic(path, before)


def supersede(
    root: Path,
    state_path: Path,
    *,
    story_id: str,
    run_id: str,
    previous_generation: int,
    generation: int,
    lineage_path: Path,
    reason: str,
) -> dict[str, Any]:
    if generation != previous_generation + 1:
        raise ContractError("new generation must equal previous_generation + 1")
    root = root.resolve()
    runtime = root_runtime(root)
    if state_path.resolve() != (runtime / "state.json").resolve():
        raise ContractError("generation state path must be the implementation runtime state")
    try:
        lineage_relative = lineage_path.resolve().relative_to(root)
    except ValueError as exc:
        raise ContractError("generation lineage path must be inside project root") from exc
    _, lineage_ref = canonical_relative(root, lineage_relative, allow_new=True)
    if lineage_path.exists():
        raise ContractError("generation lineage artifact already exists")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    if story.get("status") != "ESCALATED":
        raise ContractError("only an ESCALATED story can start a new generation")
    ledger_path = runtime / "evidence-ledger.jsonl"
    events = read_jsonl(ledger_path)
    prior_scope = [
        event for event in events
        if event.get("story_id") == story_id
        and event.get("run_id") == run_id
        and event.get("generation") == previous_generation
        and event.get("producer") == "scope_gate"
        and event.get("gate") == "FINAL_SCOPE_GATE"
        and event.get("status") == "FAIL"
    ]
    if len(prior_scope) != 1:
        raise ContractError("expected exactly one failed FINAL_SCOPE_GATE for the prior generation")
    frozen_registry = load_json(runtime / "frozen-artifacts.json")
    artifacts = frozen_registry.get("artifacts", {}) if isinstance(frozen_registry, dict) else {}
    if any(
        isinstance(entry, dict)
        and entry.get("story_id") == story_id
        and entry.get("run_id") == run_id
        and entry.get("generation") == generation
        for entry in artifacts.values()
    ):
        raise ContractError("new generation already has frozen artifacts")

    created_at = now_utc()
    lineage: dict[str, Any] = {
        "schema_version": "1.0",
        "kind": "GENERATION_SUPERSEDED",
        "story_id": story_id,
        "run_id": run_id,
        "previous_generation": previous_generation,
        "generation": generation,
        "prior_terminal_status": "ESCALATED",
        "prior_final_scope_evidence_id": prior_scope[0]["evidence_id"],
        "prior_final_scope_result_fingerprint": prior_scope[0]["result_fingerprint"],
        "reason": reason,
        "created_at": created_at,
    }
    lineage["fingerprint"] = canonical_hash(lineage)
    event = {
        "evidence_id": f"EV-GENERATION-SUPERSEDE-{story_id}-{run_id}-{generation}",
        "kind": "GENERATION_SUPERSEDED",
        "status": "PASS",
        "story_id": story_id,
        "run_id": run_id,
        "previous_generation": previous_generation,
        "generation": generation,
        "producer": "supersede_generation",
        "gate": "GENERATION_SUPERSEDE",
        "artifact_ref": lineage_ref,
        "lineage_fingerprint": lineage["fingerprint"],
        "prior_final_scope_evidence_id": prior_scope[0]["evidence_id"],
        "timestamp": created_at,
    }
    event["result_fingerprint"] = canonical_hash(event)

    state_before = state_path.read_bytes()
    ledger_before = ledger_path.read_bytes()
    try:
        lineage_path.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(lineage_path, lineage)
        story["status"] = "HANDOFF_VERIFYING"
        story["run_id"] = run_id
        story["iteration"] = 1
        story["generation"] = generation
        story["supersedes_generation"] = previous_generation
        story["generation_lineage_ref"] = lineage_ref
        story["last_transition"] = {
            "from": "ESCALATED",
            "to": "HANDOFF_VERIFYING",
            "reason": reason,
            "timestamp": created_at,
        }
        state["revision"] = int(state.get("revision", 0)) + 1
        state["runtime_status"] = "RUNNING"
        state["active_story_id"] = story_id
        write_json_atomic(state_path, state)
        append_jsonl(ledger_path, event)
    except Exception as exc:
        try:
            _restore(state_path, state_before)
            _restore(ledger_path, ledger_before)
            _restore(lineage_path, None)
        except Exception as restore_exc:
            raise ContractError(f"generation supersede failed and rollback failed: {restore_exc}") from exc
        raise ContractError(f"generation supersede rolled back: {exc}") from exc
    return {"status": "PASS", "story_id": story_id, "generation": generation, "lineage_ref": lineage_ref, "evidence_id": event["evidence_id"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--previous-generation", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--lineage-output", required=True, type=Path)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(supersede(args.project_root, args.state, story_id=args.story_id, run_id=args.run_id, previous_generation=args.previous_generation, generation=args.generation, lineage_path=args.lineage_output, reason=args.reason), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
