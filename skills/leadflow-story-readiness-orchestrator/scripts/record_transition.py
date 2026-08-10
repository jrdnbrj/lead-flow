#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Apply a schema-valid story status transition; READY_FOR_DEV is reserved for ready_gate.py."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, GATES, atomic_write_json, default_runtime, load_json, now_utc, require_valid_state, state_stories, validate_state


TRANSITIONS = {
    "PENDING": {"VALIDATING", "NEEDS_REVALIDATION", "ESCALATED"},
    "VALIDATING": {"NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "REVALIDATING", "ESCALATED"},
    "NEEDS_TECHNICAL_FIX": {"REVALIDATING", "NEEDS_USER_DECISION", "ESCALATED"},
    "NEEDS_USER_DECISION": {"NEEDS_TECHNICAL_FIX", "REVALIDATING", "ESCALATED"},
    "REVALIDATING": {"NEEDS_TECHNICAL_FIX", "NEEDS_USER_DECISION", "ESCALATED"},
    "NEEDS_REVALIDATION": {"VALIDATING", "REVALIDATING", "ESCALATED"},
    "ESCALATED": {"NEEDS_USER_DECISION", "VALIDATING", "REVALIDATING"},
}
GATE_FOR_STATUS = {
    "PENDING": "SELECT_STORY",
    "VALIDATING": "VALIDATE",
    "NEEDS_TECHNICAL_FIX": "AUTO_FIX",
    "NEEDS_USER_DECISION": "STOP_AND_ASK_USER",
    "REVALIDATING": "REVALIDATING",
    "NEEDS_REVALIDATION": "VALIDATE",
    "ESCALATED": "ESCALATE",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--runtime", default=None)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--to", required=True)
    parser.add_argument("--result", default=None, help="JSON result artifact to attach")
    parser.add_argument("--evidence-ref", action="append", default=[])
    parser.add_argument("--blockers-open", default=None)
    parser.add_argument("--operation-id", required=True)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        state_path = runtime / "state.json"
        state = require_valid_state(state_path, root)
        stories = state_stories(state)
        if args.story_id not in stories:
            raise ContractError(f"unknown story_id: {args.story_id}")
        story = stories[args.story_id]
        current = story["status"]
        if args.to == "READY_FOR_DEV":
            raise ContractError("READY_FOR_DEV can only be written by ready_gate.py")
        if args.to not in TRANSITIONS.get(current, set()):
            raise ContractError(f"invalid transition {current} -> {args.to}")
        if args.to == "NEEDS_USER_DECISION" and not story.get("pending_decision_ref"):
            raise ContractError("NEEDS_USER_DECISION requires pending_decision_ref")
        if args.to in {"VALIDATING", "REVALIDATING"}:
            next_round = story["review_round"] + 1
            if next_round > 2:
                raise ContractError("review_round limit exceeded; use FULL_STORY_AUDIT")
            story["review_round"] = next_round
        story["status"] = args.to
        story["current_gate"] = GATE_FOR_STATUS[args.to]
        if args.result:
            attached_result = load_json(Path(args.result).resolve())
            if not isinstance(attached_result, dict):
                raise ContractError("transition result must be an object")
            attached_result = {
                **attached_result,
                "gate": attached_result.get("gate", GATE_FOR_STATUS[args.to]),
                "verdict": attached_result.get("verdict", "PENDING"),
                "iteration": attached_result.get("iteration", story.get("review_round", 0)),
                "evidence_refs": attached_result.get("evidence_refs", list(args.evidence_ref)),
                "timestamp": attached_result.get("timestamp", now_utc()),
            }
            if attached_result["gate"] not in GATES:
                raise ContractError("transition result has an invalid gate")
            if attached_result["verdict"] not in {"PASS", "FAIL", "APPLIED", "ESCALATED", "PENDING"}:
                raise ContractError("transition result has an invalid verdict")
            story["last_result"] = attached_result
        else:
            story["last_result"] = story.get("last_result")
        if args.blockers_open:
            story["blockers_open"] = load_json(Path(args.blockers_open).resolve())
        if args.evidence_ref:
            story["evidence_refs"] = list(dict.fromkeys(list(story.get("evidence_refs", [])) + args.evidence_ref))
        story.setdefault("timestamps", {})["updated_at"] = now_utc()
        validation_errors = validate_state(state, root)
        if validation_errors:
            raise ContractError("transition would create invalid state: " + "; ".join(validation_errors))
        state["state_revision"] += 1
        state.setdefault("operations", []).append({"operation_id": args.operation_id, "story_id": args.story_id, "to": args.to, "timestamp": now_utc()})
        atomic_write_json(state_path, state)
        print(json.dumps({"ok": True, "story_id": args.story_id, "status": args.to, "state_revision": state["state_revision"]}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
