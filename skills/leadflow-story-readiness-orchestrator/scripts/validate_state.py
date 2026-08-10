#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Validate the persisted orchestrator state and return machine-readable diagnostics."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lib import ContractError, default_runtime, load_json, validate_state


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--state", default=None)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    path = Path(args.state).resolve() if args.state else default_runtime(root) / "state.json"
    try:
        value = load_json(path)
        if not isinstance(value, dict):
            raise ContractError("state must be a JSON object")
        errors = validate_state(value, root)
        result = {"valid": not errors, "state": str(path), "errors": errors}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if not errors else 1
    except ContractError as exc:
        print(json.dumps({"valid": False, "state": str(path), "errors": [str(exc)]}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
