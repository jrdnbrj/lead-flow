#!/usr/bin/env python3
"""Relink intact imported operational evidence into a successor generation."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import ContractError, append_jsonl, attach_provenance, canonical_hash, load_json, result_fingerprint, sha256_file, validate_required_frozen_artifacts, verify_result_fingerprint, write_json_atomic


SEMANTIC_RULES = {"ordinal_position_compacted", "managed_owner_grantee_role", "managed_realtime_messages"}


def _artifact_fingerprint(path: Path, expected_type: str) -> dict[str, Any]:
    artifact = load_json(path)
    if artifact.get("artifact_type") != expected_type:
        raise ContractError(f"unexpected artifact type: {path}")
    actual = artifact.get("artifact_fingerprint")
    payload = dict(artifact)
    payload.pop("artifact_fingerprint", None)
    if not isinstance(actual, str) or actual != canonical_hash(payload):
        raise ContractError(f"artifact fingerprint mismatch: {path}")
    return artifact


def _prior_import(ledger_path: Path, result_path: Path, *, story_id: str, run_id: str, generation: int) -> dict[str, Any]:
    result = load_json(result_path)
    if result.get("story_id") != story_id or result.get("run_id") != run_id or result.get("generation") != generation:
        raise ContractError("prior external evidence result context mismatch")
    if result.get("result_fingerprint") != result_fingerprint(result):
        raise ContractError("prior external evidence result fingerprint mismatch")
    expected_ref = result_path.resolve()
    matches: list[dict[str, Any]] = []
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        event = json.loads(line)
        if (
            event.get("story_id") == story_id
            and event.get("run_id") == run_id
            and event.get("generation") == generation
            and event.get("producer") == "import_external_evidence"
            and event.get("gate") == "VALIDATING_EVIDENCE"
            and event.get("status") == "PASS"
            and event.get("result_fingerprint") == result["result_fingerprint"]
        ):
            matches.append(event)
    if len(matches) != 1:
        raise ContractError("expected exactly one ledger-bound prior external evidence import")
    return {"result": result, "event": matches[0], "artifact_ref": expected_ref}


def _negative_cases(path: Path) -> dict[str, Any]:
    lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(lines) != 10:
        raise ContractError("negative-case artifact must contain exactly 10 results")
    expected = {f"NC-{index:02d}" for index in range(1, 11)}
    observed = {line.split(" ", 1)[0] for line in lines}
    if observed != expected or any("expected=FAIL observed=FAIL" not in line for line in lines):
        raise ContractError("negative-case artifact is not the expected 10/10 failure set")
    return {"ref": path.name, "sha256": sha256_file(path), "count": len(lines)}


def relink(
    root: Path,
    *,
    previous_result: Path,
    previous_ledger: Path,
    semantic_path: Path,
    realtime_path: Path,
    negative_path: Path,
    output: Path,
    ledger: Path,
    story_id: str,
    run_id: str,
    previous_generation: int,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
) -> dict[str, Any]:
    root = root.resolve()
    prior = _prior_import(previous_ledger, previous_result, story_id=story_id, run_id=run_id, generation=previous_generation)
    semantic = _artifact_fingerprint(semantic_path, "FINAL_SEMANTIC_COMPARISON")
    if semantic.get("status") != "PASS" or semantic.get("terminal_marker") != "FINAL_RESTORE_MATCH_OK":
        raise ContractError("terminal semantic comparison is not PASS")
    comparison = semantic.get("comparable_result")
    if not isinstance(comparison, dict) or comparison.get("exact_match") is not True or comparison.get("unclassified_difference_count") != 0:
        raise ContractError("terminal semantic comparison has unresolved differences")
    rules = semantic.get("normalization_contract")
    if not isinstance(rules, list) or {item.get("id") for item in rules if isinstance(item, dict)} != SEMANTIC_RULES:
        raise ContractError("terminal semantic comparison normalization contract changed")
    realtime = _artifact_fingerprint(realtime_path, "FINAL_REALTIME_VERIFICATION")
    verification = realtime.get("verification")
    plan = realtime.get("regenerated_plan")
    if realtime.get("status") != "PASS" or not isinstance(verification, dict) or not isinstance(plan, dict) or verification.get("source_target_leadflow_membership_exact_match") is not True or plan.get("alter_publication_count") != 0:
        raise ContractError("terminal Realtime verification is not PASS")
    negative = _negative_cases(negative_path)
    frozen = validate_required_frozen_artifacts(root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation, input_fingerprint=input_fingerprint, story_fingerprint=story_fingerprint)
    output_relative = output.resolve().relative_to(root)
    ledger_relative = ledger.resolve().relative_to(root)
    evidence_id = f"EV-EVIDENCE-REUSE-{story_id}-{run_id}-{iteration}-{generation}"
    payload = {
        "status": "PASS",
        "kind": "EXTERNAL_EVIDENCE_REUSED",
        "source_generation": previous_generation,
        "source_import": {
            "evidence_id": prior["event"]["evidence_id"],
            "request_id": prior["event"].get("request_id"),
            "request_fingerprint": prior["event"].get("request_fingerprint"),
            "result_fingerprint": prior["result"]["result_fingerprint"],
            "artifact_ref": prior["event"].get("artifact_ref"),
        },
        "terminal_artifacts": {
            "semantic": {"ref": semantic_path.name, "file_sha256": sha256_file(semantic_path), "artifact_fingerprint": semantic["artifact_fingerprint"]},
            "realtime": {"ref": realtime_path.name, "file_sha256": sha256_file(realtime_path), "artifact_fingerprint": realtime["artifact_fingerprint"]},
            "negative_cases": negative,
        },
        "verification_mode": "RELINKED_FROM_LEDGER_BOUND_IMPORT",
        "limitations": "External references remain human-attested exactly as imported in the source generation; no remote evidence was reread or re-executed.",
    }
    result = attach_provenance(payload, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation, input_fingerprint=input_fingerprint, story_fingerprint=story_fingerprint, frozen_artifacts=frozen, evidence_ledger=ledger_relative.as_posix(), evidence_refs=[evidence_id], producer="relink_external_evidence", gate="VALIDATING_EVIDENCE", result_artifact_ref=output_relative.as_posix())
    write_json_atomic(output, result)
    append_jsonl(ledger, {
        "evidence_id": evidence_id,
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
        "producer": "relink_external_evidence",
        "gate": "VALIDATING_EVIDENCE",
        "artifact_ref": output_relative.as_posix(),
        "result_fingerprint": result["provenance"]["result_fingerprint"],
        "frozen_artifacts": frozen,
        "status": "PASS",
        "source_evidence_id": prior["event"]["evidence_id"],
        "source_result_fingerprint": prior["result"]["result_fingerprint"],
    })
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--previous-result", required=True, type=Path)
    parser.add_argument("--previous-ledger", required=True, type=Path)
    parser.add_argument("--semantic", required=True, type=Path)
    parser.add_argument("--realtime", required=True, type=Path)
    parser.add_argument("--negative-cases", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--previous-generation", required=True, type=int)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    args = parser.parse_args()
    try:
        result = relink(args.project_root, previous_result=args.previous_result, previous_ledger=args.previous_ledger, semantic_path=args.semantic, realtime_path=args.realtime, negative_path=args.negative_cases, output=args.output, ledger=args.ledger, story_id=args.story_id, run_id=args.run_id, previous_generation=args.previous_generation, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
