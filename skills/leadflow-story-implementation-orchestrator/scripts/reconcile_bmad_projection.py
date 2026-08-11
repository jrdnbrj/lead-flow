#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Repair only a BMad Status projection after a valid readiness handoff."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from handoff_gate import verify
from lib import ContractError, project_bmad_status, sha256_file, write_json_atomic


def reconcile(root: Path, readiness_runtime: Path, story_id: str, story_file: Path) -> dict:
    result = verify(root, readiness_runtime, story_id, story_file)
    if result.get("status") != "RECONCILIATION_REQUIRED":
        raise ContractError(f"projection reconciliation not applicable: {result.get('status')}")
    before_hash = sha256_file(story_file)
    content = story_file.read_text(encoding="utf-8")
    updated, previous = project_bmad_status(content, "ready-for-dev")
    if previous.lower() == "ready-for-dev":
        raise ContractError("projection does not require reconciliation")
    story_file.write_text(updated, encoding="utf-8")
    after_hash = sha256_file(story_file)
    return {"status": "PASS", "story_id": story_id, "from": previous, "to": "ready-for-dev", "before_hash": before_hash, "after_hash": after_hash, "authority": "readiness-runtime"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--readiness-runtime", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--story-file", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(reconcile(args.project_root.resolve(), args.readiness_runtime.resolve(), args.story_id, args.story_file.resolve()), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
