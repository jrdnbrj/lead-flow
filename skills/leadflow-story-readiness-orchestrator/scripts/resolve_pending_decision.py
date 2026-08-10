#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Append an explicit user decision and close its request through state."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, append_jsonl, atomic_write_json, default_runtime, load_json, now_utc, read_jsonl, require_valid_state, state_stories


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--response", required=True)
    parser.add_argument("--runtime", default=None)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    state_path = runtime / "state.json"
    pending_path = runtime / "pending-decision.json"
    try:
        pending = load_json(pending_path)
        response = load_json(Path(args.response).resolve())
        if pending.get("status") != "OPEN":
            raise ContractError("pending decision is not open")
        if not response.get("user_decision") or not response.get("responded_by"):
            raise ContractError("explicit user_decision and responded_by are required")
        state = require_valid_state(state_path, root)
        stories = state_stories(state)
        story_id = pending["story_id"]
        if story_id not in stories:
            raise ContractError(f"unknown story_id: {story_id}")
        ledger = runtime / "decision-ledger.jsonl"
        existing = read_jsonl(ledger)
        decision_id = f"DEC-{pending['request_id']}"
        if any(item.get("decision_id") == decision_id for item in existing):
            raise ContractError(f"decision already recorded: {decision_id}")
        decision = {
            "decision_id": decision_id,
            "timestamp": now_utc(),
            "story_id": story_id,
            "source": "pending-decision.json",
            "category": "PRODUCT_DECISION",
            "question_or_finding": pending["problem"],
            "recommendation": pending["recommendation"],
            "user_decision": response["user_decision"],
            "resulting_action": response.get("resulting_action", response["user_decision"]),
            "artifacts_affected": pending["artifacts_affected"],
            "request_id": pending["request_id"],
            "responded_by": response["responded_by"],
        }
        append_jsonl(ledger, decision)
        story = stories[story_id]
        story.update({
            "status": "NEEDS_TECHNICAL_FIX" if response.get("resulting_action") else "REVALIDATING",
            "current_gate": "AUTO_FIX" if response.get("resulting_action") else "REVALIDATING",
            "decision_required": False,
            "pending_decision_ref": None,
            "resolved_decision_id": decision_id,
        })
        story.setdefault("timestamps", {})["updated_at"] = now_utc()
        state["state_revision"] += 1
        atomic_write_json(state_path, state)
        print(json.dumps({"ok": True, "decision_id": decision_id, "pending_closed_by_state": True}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
