#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Create the empty implementation runtime without selecting or executing a story."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib import ContractError, RUNTIME_REL, now_utc, root_runtime, write_json_atomic


def initialize(root: Path) -> dict:
    runtime = root_runtime(root)
    state_path = runtime / "state.json"
    if state_path.exists():
        raise ContractError(f"runtime already exists: {state_path}")
    runtime.mkdir(parents=True, exist_ok=True)
    (runtime / "runs").mkdir(exist_ok=True)
    (runtime / "locks").mkdir(exist_ok=True)
    (runtime / "runs" / ".gitkeep").touch()
    (runtime / "locks" / ".gitkeep").touch()
    (runtime / "evidence-ledger.jsonl").touch()
    (runtime / "decision-ledger.jsonl").touch()
    state = {
        "schema_version": "1.0",
        "workflow": "leadflow-story-implementation-orchestrator",
        "runtime_status": "IDLE",
        "revision": 0,
        "active_story_id": None,
        "created_at": now_utc(),
        "stories": [],
    }
    write_json_atomic(state_path, state)
    write_json_atomic(runtime / "frozen-artifacts.json", {"schema_version": "1.0", "artifacts": {}})
    write_json_atomic(runtime / "baseline-snapshots.json", {"schema_version": "1.0", "snapshots": {}})
    write_json_atomic(runtime / "external-evidence-requests.json", {"schema_version": "1.0", "requests": {}})
    write_json_atomic(runtime / "evidence-index.json", {"schema_version": "1.0", "entries": []})
    return {"status": "PASS", "runtime": str(runtime.relative_to(root.resolve())), "state": state}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(initialize(args.project_root.resolve()), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
