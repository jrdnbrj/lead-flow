#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Select the next dependency-eligible story without using file order."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, default_runtime, require_valid_state, state_stories, story_sort_key
from resume_reconcile import reconcile


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--runtime", default=None)
    parser.add_argument("--story", default=None)
    parser.add_argument("--stop-after-terminal", action="store_true")
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        reconcile_result = reconcile(root, runtime)
        state = require_valid_state(runtime / "state.json", root)
        stories = state_stories(state)
        eligible = []
        reasons = {}
        for story_id in sorted(stories, key=story_sort_key):
            story = stories[story_id]
            if story["status"] == "READY_FOR_DEV":
                reasons[story_id] = ["ALREADY_READY_FOR_DEV"]
                continue
            blocked = [
                f"DEPENDENCY_NOT_READY:{dependency}"
                for dependency in story["dependencies"]
                if stories[dependency]["status"] != "READY_FOR_DEV"
            ]
            if blocked:
                reasons[story_id] = blocked
            elif story["status"] in {"ESCALATED", "NEEDS_USER_DECISION"}:
                reasons[story_id] = [f"STATUS_REQUIRES_RESOLUTION:{story['status']}"]
            else:
                eligible.append(story_id)
        if args.story and args.story not in eligible:
            raise ContractError(f"requested story is not eligible: {args.story}; reasons={reasons.get(args.story, ['UNKNOWN_STORY'])}")
        selected = args.story or (eligible[0] if eligible else None)
        result = {
            "ok": True,
            "selected_story": selected,
            "eligible": eligible,
            "blocked": reasons,
            "reconciliation": reconcile_result,
            "stop_after_terminal": args.stop_after_terminal,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if selected else 1
    except (ContractError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
