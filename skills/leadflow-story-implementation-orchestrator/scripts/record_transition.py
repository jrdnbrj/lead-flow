#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Record a non-terminal story transition; DONE is reserved for done_gate.py."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib import ContractError, STATES, ensure_story_in_state, load_json, now_utc, validate_state_shape, write_json_atomic


def transition(state_path: Path, story_id: str, target: str, reason: str) -> dict:
    if target not in STATES or target == "DONE":
        raise ContractError("record_transition cannot write DONE or an unknown state")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    previous = story["status"]
    execution_type = story.get("execution_type")
    if target == "IMPLEMENTING" and execution_type not in {"IMPLEMENTATION", "HYBRID"}:
        raise ContractError("OPERATIONAL stories cannot enter IMPLEMENTING")
    if target == "AWAITING_EXTERNAL_EVIDENCE" and execution_type not in {"OPERATIONAL", "HYBRID"}:
        raise ContractError("IMPLEMENTATION stories cannot enter AWAITING_EXTERNAL_EVIDENCE")
    allowed = {
        "PENDING": {"HANDOFF_VERIFYING", "NEEDS_USER_DECISION", "ESCALATED"},
        "HANDOFF_VERIFYING": {"READY_FOR_IMPLEMENTATION", "RECONCILIATION_REQUIRED", "NEEDS_USER_DECISION", "ESCALATED"},
        "RECONCILIATION_REQUIRED": {"HANDOFF_VERIFYING", "ESCALATED"},
        "READY_FOR_IMPLEMENTATION": {"SCOPE_LOCKED", "NEEDS_USER_DECISION", "ESCALATED"},
        "SCOPE_LOCKED": {"IMPLEMENTING", "AWAITING_EXTERNAL_EVIDENCE", "NEEDS_USER_DECISION", "ESCALATED"},
        "IMPLEMENTING": {"VALIDATING", "NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "ESCALATED"},
        "VALIDATING": {"REVIEWING", "AWAITING_EXTERNAL_EVIDENCE", "NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "ESCALATED"},
        "AWAITING_EXTERNAL_EVIDENCE": {"VALIDATING_EVIDENCE", "NEEDS_USER_DECISION", "ESCALATED"},
        "VALIDATING_EVIDENCE": {"REVIEWING", "NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "ESCALATED"},
        "REVIEWING": {"NEEDS_TECHNICAL_FIX", "CANDIDATE_DONE", "NEEDS_USER_DECISION", "ESCALATED"},
        "NEEDS_TECHNICAL_FIX": {"REVALIDATING", "NEEDS_USER_DECISION", "ESCALATED"},
        "REVALIDATING": {"REVIEWING", "NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "ESCALATED"},
        "CANDIDATE_DONE": {"NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "ESCALATED"},
        "DONE": set(),
        "NEEDS_USER_DECISION": set(),
        "ESCALATED": set(),
    }
    if target not in allowed.get(previous, set()):
        raise ContractError(f"illegal transition {previous} -> {target}")
    story["status"] = target
    story["last_transition"] = {"from": previous, "to": target, "reason": reason, "timestamp": now_utc()}
    state["revision"] = int(state.get("revision", 0)) + 1
    state["runtime_status"] = "BLOCKED" if target in {"NEEDS_USER_DECISION", "ESCALATED"} else "RUNNING"
    state["active_story_id"] = story_id
    write_json_atomic(state_path, state)
    return {"status": "PASS", "story_id": story_id, "from": previous, "to": target}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(transition(args.state, args.story_id, args.target, args.reason), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
