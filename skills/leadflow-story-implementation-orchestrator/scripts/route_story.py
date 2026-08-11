#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Deterministically route a story to FAST or STRICT."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib import ContractError, classify_workflow_mode, load_json, require_story_id


def route(
    story_file: Path,
    *,
    execution_type: str,
    scope_manifest: Path | None = None,
    validation_plan: Path | None = None,
) -> dict:
    story_text = story_file.read_text(encoding="utf-8")
    scope_paths: list[str] = []
    if scope_manifest is not None:
        manifest = load_json(scope_manifest)
        for key in ("exact_paths_allowed", "generated_artifacts_allowed", "forbidden_paths"):
            values = manifest.get(key, [])
            if isinstance(values, list):
                scope_paths.extend(str(value) for value in values)
        prefixes = manifest.get("path_prefixes_allowed", [])
        if isinstance(prefixes, list):
            scope_paths.extend(str(item.get("path")) for item in prefixes if isinstance(item, dict))
    external_required = execution_type.upper() in {"OPERATIONAL", "HYBRID"}
    if validation_plan is not None:
        plan = load_json(validation_plan)
        external_required = external_required or plan.get("external_evidence_required") is True
    result = classify_workflow_mode(
        story_text=story_text,
        execution_type=execution_type,
        scope_paths=scope_paths,
        external_evidence_required=external_required,
    )
    result.update({"status": "PASS", "story_id": require_story_id(_story_id(story_text))})
    return result


def _story_id(content: str) -> str:
    import re

    match = re.search(r"^\s*#\s*(?:Story\s+)?(E\d+-S\d+[a-z]?)", content, re.I | re.M)
    if not match:
        raise ContractError("story file does not contain a canonical story heading")
    return match.group(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--story-file", required=True, type=Path)
    parser.add_argument("--execution-type", required=True)
    parser.add_argument("--scope-manifest", type=Path)
    parser.add_argument("--validation-plan", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(route(args.story_file.resolve(), execution_type=args.execution_type, scope_manifest=args.scope_manifest.resolve() if args.scope_manifest else None, validation_plan=args.validation_plan.resolve() if args.validation_plan else None), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
