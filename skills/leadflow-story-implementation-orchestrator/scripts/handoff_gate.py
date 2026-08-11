#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Verify the readiness runtime before implementation handoff."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from lib import ContractError, append_jsonl, attach_provenance, extract_bmad_status, load_json, project_bmad_status, require_story_id, validate_required_frozen_artifacts, write_json_atomic, sha256_file


def verify(root: Path, readiness_runtime: Path, story_id: str, story_file: Path) -> dict[str, Any]:
    state = load_json(readiness_runtime / "state.json")
    stories = state.get("stories")
    if not isinstance(stories, list):
        raise ContractError("readiness state stories must be an array")
    story = next((item for item in stories if item.get("story_id") == story_id), None)
    if not isinstance(story, dict):
        return {"status": "ESCALATED", "reason": "STORY_NOT_IN_READINESS_RUNTIME"}
    if story.get("status") != "READY_FOR_DEV":
        return {"status": "ESCALATED", "reason": "READINESS_NOT_READY", "readiness_status": story.get("status")}
    if story.get("invalidated") is True or story.get("needs_revalidation") is True:
        return {"status": "ESCALATED", "reason": "READINESS_INVALIDATED"}
    fingerprint = story.get("fingerprint")
    expected_hash = fingerprint.get("value") if isinstance(fingerprint, dict) else None
    if not isinstance(expected_hash, str):
        return {"status": "ESCALATED", "reason": "READINESS_FINGERPRINT_MISSING"}
    content = story_file.read_text(encoding="utf-8")
    actual_hash = sha256_file(story_file)
    projection_reconciled = False
    projection_from = None
    if actual_hash != expected_hash:
        source_status = story.get("source_status_observed")
        if not isinstance(source_status, str) or not source_status:
            return {"status": "ESCALATED", "reason": "STORY_CONTENT_FINGERPRINT_DIVERGENCE", "expected": expected_hash, "actual": actual_hash}
        try:
            projected_back, current_status = project_bmad_status(content, source_status)
        except ContractError:
            return {"status": "ESCALATED", "reason": "STORY_CONTENT_FINGERPRINT_DIVERGENCE", "expected": expected_hash, "actual": actual_hash}
        if hashlib.sha256(projected_back.encode("utf-8")).hexdigest() != expected_hash:
            return {"status": "ESCALATED", "reason": "STORY_CONTENT_FINGERPRINT_DIVERGENCE", "expected": expected_hash, "actual": actual_hash}
        if current_status.lower() != "ready-for-dev":
            return {"status": "RECONCILIATION_REQUIRED", "reason": "BMAD_PROJECTION_DRIFT", "bmad_status": current_status, "readiness_status": "READY_FOR_DEV", "readiness_fingerprint": expected_hash}
        projection_reconciled = True
        projection_from = source_status
    refs = story.get("evidence_refs")
    if not isinstance(refs, list) or not refs:
        return {"status": "ESCALATED", "reason": "READINESS_EVIDENCE_MISSING"}
    ledger_path = readiness_runtime / "evidence-ledger.jsonl"
    evidence = []
    if ledger_path.exists():
        for line in ledger_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                evidence.append(json.loads(line))
    by_id = {item.get("evidence_id"): item for item in evidence if isinstance(item, dict)}
    missing = [ref for ref in refs if ref not in by_id]
    non_pass = [ref for ref in refs if ref in by_id and by_id[ref].get("final_verdict") != "PASS"]
    if missing or non_pass:
        return {"status": "ESCALATED", "reason": "READINESS_PASS_EVIDENCE_INVALID", "missing": missing, "non_pass": non_pass}
    bmad_status = extract_bmad_status(content)
    if bmad_status.lower() != "ready-for-dev":
        return {"status": "RECONCILIATION_REQUIRED", "reason": "BMAD_PROJECTION_DRIFT", "bmad_status": bmad_status, "readiness_status": "READY_FOR_DEV", "readiness_fingerprint": expected_hash}
    return {"status": "PASS", "reason": "VALID_READINESS_HANDOFF", "readiness_fingerprint": expected_hash, "story_fingerprint": actual_hash, "bmad_status": bmad_status, "projection_reconciled": projection_reconciled, "projection_from": projection_from, "evidence_refs": refs}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--readiness-runtime", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--story-file", required=True, type=Path)
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
        refs = [f"EV-HANDOFF-{args.story_id}-{args.run_id}-{args.iteration}-{args.generation}"]
        output = attach_provenance(verify(root, args.readiness_runtime.resolve(), require_story_id(args.story_id), args.story_file.resolve()), story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint, frozen_artifacts=frozen, evidence_ledger=ledger_relative.as_posix(), evidence_refs=refs, producer="handoff_gate", gate="HANDOFF", result_artifact_ref=output_relative.as_posix())
        write_json_atomic(args.output, output)
        append_jsonl(args.ledger, {"evidence_id": refs[0], "story_id": args.story_id, "run_id": args.run_id, "iteration": args.iteration, "generation": args.generation, "input_fingerprint": args.input_fingerprint, "story_fingerprint": args.story_fingerprint, "producer": "handoff_gate", "gate": "HANDOFF", "artifact_ref": output_relative.as_posix(), "result_fingerprint": output["provenance"]["result_fingerprint"], "frozen_artifacts": frozen, "status": output["status"]})
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0 if output["status"] == "PASS" else 1
    except (ContractError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
