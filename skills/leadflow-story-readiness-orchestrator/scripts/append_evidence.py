#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Validate and append one evidence ledger entry."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, atomic_write_json, default_runtime, evidence_index, append_jsonl, load_json, read_jsonl


REQUIRED = ("evidence_id", "story", "gate", "iteration", "input_artifact", "reviewer_result", "blockers", "resolution", "timestamp", "final_verdict")
VERDICTS = {"PASS", "FAIL", "ESCALATED", "PENDING"}


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
            raise ContractError(f"evidence entry missing fields: {', '.join(missing)}")
        if entry["final_verdict"] not in VERDICTS:
            raise ContractError(f"invalid evidence final_verdict: {entry['final_verdict']}")
        ledger = runtime / "evidence-ledger.jsonl"
        if any(existing.get("evidence_id") == entry["evidence_id"] for existing in read_jsonl(ledger)):
            raise ContractError(f"duplicate evidence_id: {entry['evidence_id']}")
        append_jsonl(ledger, entry)
        atomic_write_json(runtime / "evidence-index.json", evidence_index(ledger))
        print(json.dumps({"ok": True, "evidence_id": entry["evidence_id"]}, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
