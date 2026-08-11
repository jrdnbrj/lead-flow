#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Require implementation dependencies to be DONE before starting a story."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib import ContractError, append_jsonl, attach_provenance, ensure_story_in_state, load_json, require_story_id, validate_required_frozen_artifacts, write_json_atomic


def evaluate(readiness_state_path: Path, implementation_state_path: Path, story_id: str) -> dict:
    readiness = load_json(readiness_state_path)
    implementation = load_json(implementation_state_path)
    readiness_story = ensure_story_in_state(readiness, story_id)
    dependencies = readiness_story.get("dependencies", [])
    if not isinstance(dependencies, list):
        raise ContractError("readiness dependencies must be an array")
    implementation_stories = {item.get("story_id"): item for item in implementation.get("stories", []) if isinstance(item, dict)}
    blockers = []
    for dependency in dependencies:
        dep = implementation_stories.get(dependency)
        if dep is None or dep.get("status") != "DONE":
            blockers.append({"story_id": dependency, "status": dep.get("status") if dep else "MISSING"})
    return {"status": "PASS" if not blockers else "FAIL", "story_id": story_id, "dependencies": dependencies, "blockers": blockers}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readiness-state", required=True, type=Path)
    parser.add_argument("--implementation-state", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    args = parser.parse_args()
    try:
        root = args.project_root.resolve()
        expected = {"story_id": args.story_id, "run_id": args.run_id, "iteration": args.iteration, "generation": args.generation, "input_fingerprint": args.input_fingerprint, "story_fingerprint": args.story_fingerprint}
        frozen = validate_required_frozen_artifacts(root, **expected)
        output_relative = args.output.resolve().relative_to(root)
        ledger_relative = args.ledger.resolve().relative_to(root)
        refs = [f"EV-DEPENDENCY-{args.story_id}-{args.run_id}-{args.iteration}-{args.generation}"]
        output = attach_provenance(evaluate(args.readiness_state, args.implementation_state, require_story_id(args.story_id)), story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint, frozen_artifacts=frozen, evidence_ledger=ledger_relative.as_posix(), evidence_refs=refs, producer="dependency_gate", gate="DEPENDENCY_GATE", result_artifact_ref=output_relative.as_posix())
        write_json_atomic(args.output, output)
        append_jsonl(args.ledger, {"evidence_id": refs[0], "story_id": args.story_id, "run_id": args.run_id, "iteration": args.iteration, "generation": args.generation, "input_fingerprint": args.input_fingerprint, "story_fingerprint": args.story_fingerprint, "producer": "dependency_gate", "gate": "DEPENDENCY_GATE", "artifact_ref": output_relative.as_posix(), "result_fingerprint": output["provenance"]["result_fingerprint"], "frozen_artifacts": frozen, "status": output["status"]})
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0 if output["status"] == "PASS" else 1
    except ContractError as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
