#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Select exactly one explicit story; never scan for the first ready story."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib import ContractError, ensure_story_in_state, load_json, require_story_id, validate_state_shape


def select(state_path: Path, story_id: str, allowlist: list[str]) -> dict:
    story_id = require_story_id(story_id)
    normalized = [require_story_id(item) for item in allowlist]
    if normalized != [story_id] or len(set(normalized)) != 1:
        raise ContractError("selection requires an explicit one-story allowlist")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    if story.get("status") not in {"PENDING", "READY_FOR_IMPLEMENTATION", "HANDOFF_VERIFYING"}:
        raise ContractError(f"story is not selectable from current implementation state: {story.get('status')}")
    return {"status": "PASS", "story_id": story_id, "execution_type": story.get("execution_type")}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--allowlist", nargs="+", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(select(args.state, args.story_id, args.allowlist), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
