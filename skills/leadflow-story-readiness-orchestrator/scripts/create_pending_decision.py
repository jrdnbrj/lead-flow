#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Persist a decision request without creating a decision ledger entry."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, atomic_write_json, default_runtime, load_json, now_utc, require_valid_state, state_stories


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--request", required=True)
    parser.add_argument("--runtime", default=None)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    state_path = runtime / "state.json"
    pending_path = runtime / "pending-decision.json"
    try:
        request = load_json(Path(args.request).resolve())
        required = ("request_id", "story_id", "category", "problem", "evidence", "recommendation", "alternatives", "artifacts_affected", "question")
        missing = [field for field in required if field not in request]
        if missing:
            raise ContractError(f"pending decision missing fields: {', '.join(missing)}")
        if request["category"] != "PRODUCT_DECISION":
            raise ContractError("pending decision category must be PRODUCT_DECISION")
        if not isinstance(request["alternatives"], list) or not 1 <= len(request["alternatives"]) <= 2:
            raise ContractError("pending decision requires one or two alternatives")
        if pending_path.exists():
            raise ContractError("an unresolved pending-decision.json already exists")
        state = require_valid_state(state_path, root)
        stories = state_stories(state)
        story_id = request["story_id"]
        if story_id not in stories:
            raise ContractError(f"unknown story_id: {story_id}")
        if stories[story_id]["status"] == "READY_FOR_DEV":
            raise ContractError("cannot create a decision request for READY_FOR_DEV without invalidation")
        request = {**request, "schema_version": "1.0", "created_at": now_utc(), "status": "OPEN"}
        atomic_write_json(pending_path, request)
        story = stories[story_id]
        story.update({
            "status": "NEEDS_USER_DECISION",
            "current_gate": "STOP_AND_ASK_USER",
            "decision_required": True,
            "pending_decision_ref": "pending-decision.json",
        })
        story.setdefault("timestamps", {})["updated_at"] = now_utc()
        state["state_revision"] += 1
        atomic_write_json(state_path, state)
        print(json.dumps({"ok": True, "request_id": request["request_id"], "pending": str(pending_path)}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
