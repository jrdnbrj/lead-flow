#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Append a decision ledger entry, rejecting unresolved product requests."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, DECISION_CATEGORIES, append_jsonl, default_runtime, load_json, read_jsonl


REQUIRED = ("decision_id", "timestamp", "story_id", "source", "category", "question_or_finding", "recommendation", "user_decision", "resulting_action", "artifacts_affected")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--entry", required=True)
    parser.add_argument("--runtime", default=None)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        entry = load_json(Path(args.entry).resolve())
        missing = [field for field in REQUIRED if field not in entry]
        if missing:
            raise ContractError(f"decision entry missing fields: {', '.join(missing)}")
        if entry["category"] not in DECISION_CATEGORIES:
            raise ContractError(f"invalid decision category: {entry['category']}")
        if entry["category"] == "PRODUCT_DECISION" and not entry.get("user_decision"):
            raise ContractError("PRODUCT_DECISION requires explicit user_decision")
        ledger = runtime / "decision-ledger.jsonl"
        existing = read_jsonl(ledger)
        if any(item.get("decision_id") == entry["decision_id"] for item in existing):
            raise ContractError(f"duplicate decision_id: {entry['decision_id']}")
        supersedes = entry.get("supersedes_decision_id")
        if supersedes and not any(item.get("decision_id") == supersedes for item in existing):
            raise ContractError(f"supersedes unknown decision: {supersedes}")
        append_jsonl(ledger, entry)
        print(json.dumps({"ok": True, "decision_id": entry["decision_id"]}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
