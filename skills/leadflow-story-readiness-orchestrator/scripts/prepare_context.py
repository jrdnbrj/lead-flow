#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Prepare a deterministic, hashed input manifest for an independent reviewer."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    atomic_write_json,
    canonical_hash,
    default_runtime,
    fingerprint_reference,
    load_json,
    now_utc,
    read_jsonl,
    require_valid_state,
    relative_path,
    sha256_file,
    state_stories,
    story_sort_key,
)


STANDARD_SOURCES = [
    ("prd", "_bmad-output/planning-artifacts/prds/prd-lead-flow-2026-08-05/prd.md"),
    ("architecture", "_bmad-output/planning-artifacts/architecture/architecture-lead-flow-2026-08-06/ARCHITECTURE-SPINE.md"),
    ("ux_design", "_bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/DESIGN.md"),
    ("ux_experience", "_bmad-output/planning-artifacts/ux-designs/ux-lead-flow-2026-08-05/EXPERIENCE.md"),
    ("epics", "_bmad-output/planning-artifacts/epics.md"),
    ("project_context", "_bmad-output/project-context.md"),
]
PATH_RE = re.compile(r"(?:^|[\s`(])((?:supabase|app|components|lib|docs)/[A-Za-z0-9_./-]+)")


def active_decisions(runtime: Path, story_id: str) -> list[dict[str, Any]]:
    entries = read_jsonl(runtime / "decision-ledger.jsonl")
    superseded = {entry.get("supersedes_decision_id") for entry in entries if entry.get("supersedes_decision_id")}
    result = []
    for entry in entries:
        if entry.get("decision_id") in superseded:
            continue
        if entry.get("story_id") == story_id or story_id in entry.get("artifacts_affected", []):
            result.append(entry)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".")
    parser.add_argument("--runtime", default=None)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--iteration", type=int, default=1)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    runtime = Path(args.runtime).resolve() if args.runtime else default_runtime(root)
    try:
        state_path = runtime / "state.json"
        state = require_valid_state(state_path, root)
        stories = state_stories(state)
        if args.story_id not in stories:
            raise ContractError(f"unknown story_id: {args.story_id}")
        story = stories[args.story_id]
        if story["status"] == "READY_FOR_DEV":
            raise ContractError("cannot prepare context for READY_FOR_DEV without explicit invalidation")
        story_path = root / story["story_file"]
        inputs: list[dict[str, Any]] = []
        input_refs: list[str] = []

        def add_file(kind: str, reference: str) -> None:
            fingerprint = fingerprint_reference(root, reference, kind=kind)
            if fingerprint["path"] not in {item["path"] for item in inputs}:
                inputs.append(fingerprint)
                input_refs.append(reference)

        add_file("story", story["story_file"])
        for dependency in sorted(story["dependencies"], key=story_sort_key):
            add_file("dependency", stories[dependency]["story_file"])
        for kind, reference in STANDARD_SOURCES:
            add_file(kind, reference)

        content = story_path.read_text(encoding="utf-8")
        for reference in sorted({match.group(1).rstrip(".,;:)") for match in PATH_RE.finditer(content)}):
            path = root / reference
            if path.is_file():
                add_file("brownfield", reference)
        decisions = active_decisions(runtime, args.story_id)
        decision_inputs = [
            {"kind": "active_decision", "decision_id": entry["decision_id"], "sha256": canonical_hash(entry)}
            for entry in decisions
        ]
        authoritative = [item for item in inputs if item["kind"] != "story"] + decision_inputs
        dependency_fingerprints = [
            {"story_id": dependency, "sha256": next(item["sha256"] for item in inputs if item["path"] == stories[dependency]["story_file"])}
            for dependency in story["dependencies"]
        ]
        iteration_dir = runtime / "runs" / args.story_id
        manifest_path = iteration_dir / f"input-manifest-{args.iteration:03d}.json"
        manifest = {
            "schema_version": "1.0",
            "story_id": args.story_id,
            "iteration": args.iteration,
            "created_at": now_utc(),
            "story_fingerprint": next(item["sha256"] for item in inputs if item["kind"] == "story"),
            "inputs": inputs,
            "active_decisions": decisions,
            "authoritative_fingerprints": authoritative,
            "dependency_fingerprints": dependency_fingerprints,
            "review_criteria": [
                "traceability to authoritative sources",
                "testable acceptance criteria",
                "scope and dependency closure",
                "brownfield compatibility",
                "security and architectural invariants",
            ],
        }
        atomic_write_json(manifest_path, manifest)
        story["authoritative_fingerprints"] = authoritative
        story["dependency_fingerprints"] = dependency_fingerprints
        story["fingerprint"] = {"algorithm": "sha256", "value": manifest["story_fingerprint"], "captured_at": manifest["created_at"]}
        story["current_gate"] = "REVALIDATING" if story["status"] == "REVALIDATING" else "VALIDATE"
        story["status"] = "REVALIDATING" if args.iteration > 1 else "VALIDATING"
        story.setdefault("timestamps", {})["updated_at"] = manifest["created_at"]
        state["state_revision"] += 1
        atomic_write_json(state_path, state)
        print(json.dumps({
            "ok": True,
            "story_id": args.story_id,
            "manifest": relative_path(root, manifest_path),
            "input_count": len(inputs),
            "active_decision_count": len(decisions),
            "source_fingerprint_count": len(authoritative),
        }, ensure_ascii=False, indent=2))
        return 0
    except (ContractError, OSError, json.JSONDecodeError, StopIteration) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
