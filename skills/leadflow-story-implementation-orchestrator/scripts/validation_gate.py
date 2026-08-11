#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Evaluate a registered frozen story validation plan and emit ledger-bound evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import ContractError, append_jsonl, attach_provenance, canonical_hash, frozen_fingerprint, load_json, now_utc, read_jsonl, require_object, require_string, result_fingerprint, secret_hits, sha256_file, validate_registered_frozen_artifact, validate_required_frozen_artifacts, validate_result_provenance, verify_fingerprint, workspace_fingerprint, write_json_atomic


def evaluate_checks(plan: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    verify_fingerprint(plan)
    checks = plan.get("checks")
    if not isinstance(checks, list):
        raise ContractError("validation plan checks must be an array")
    result_checks = result.get("checks")
    if not isinstance(result_checks, list):
        raise ContractError("validation result checks must be an array")
    by_id = {item.get("check_id"): item for item in result_checks if isinstance(item, dict)}
    failures: list[str] = []
    evaluated: list[dict[str, Any]] = []
    for check in checks:
        check_id = require_string(check.get("check_id"), "check_id")
        requirement = check.get("requirement")
        if requirement == "NOT_APPLICABLE":
            if not str(check.get("justification", "")).strip():
                failures.append(f"NOT_APPLICABLE without justification: {check_id}")
            evaluated.append({"check_id": check_id, "status": "NOT_APPLICABLE"})
            continue
        item = by_id.get(check_id)
        if item is None:
            if requirement == "REQUIRED":
                failures.append(f"missing REQUIRED validation: {check_id}")
            else:
                failures.append(f"unresolved CONDITIONAL validation: {check_id}")
            continue
        status = str(item.get("status", "")).upper()
        evaluated.append({"check_id": check_id, "status": status})
        if requirement == "REQUIRED" and status != "PASS":
            failures.append(f"REQUIRED validation is not PASS: {check_id}={status}")
        if requirement == "CONDITIONAL" and status not in {"PASS", "NOT_APPLICABLE"}:
            failures.append(f"CONDITIONAL validation is not resolved: {check_id}={status}")
    return {"status": "PASS" if not failures else "FAIL", "failures": failures, "checks": evaluated}


SEMANTIC_NORMALIZATIONS = {"ordinal_position_compacted", "managed_owner_grantee_role", "managed_realtime_messages"}


def _terminal_artifact(path: Path, artifact_type: str) -> dict[str, Any]:
    artifact = require_object(load_json(path), "terminal evidence artifact")
    if artifact.get("artifact_type") != artifact_type:
        raise ContractError(f"unexpected terminal artifact type: {path}")
    fingerprint = artifact.get("artifact_fingerprint")
    payload = dict(artifact)
    payload.pop("artifact_fingerprint", None)
    if not isinstance(fingerprint, str) or fingerprint != canonical_hash(payload):
        raise ContractError(f"terminal artifact fingerprint mismatch: {path}")
    return artifact


def evaluate_operational_evidence_review(
    root: Path,
    *,
    request_path: Path,
    external_result_path: Path,
    evidence_reuse_path: Path,
    semantic_path: Path,
    realtime_path: Path,
    negative_cases_path: Path,
    expected: dict[str, Any],
    frozen: dict[str, Any],
    ledger_path: Path,
) -> dict[str, Any]:
    execution_ref = frozen.get("story_execution_type")
    if not isinstance(execution_ref, dict):
        raise ContractError("frozen execution type is missing")
    execution = require_object(load_json(root / execution_ref["path"]), "frozen execution type")
    if execution.get("execution_type") != "OPERATIONAL":
        raise ContractError("OPERATIONAL_EVIDENCE_REVIEW is only valid for OPERATIONAL stories")
    request = require_object(load_json(request_path), "external evidence request")
    result = require_object(load_json(external_result_path), "external evidence result")
    if request.get("fingerprint") != frozen_fingerprint(request):
        raise ContractError("external evidence request fingerprint mismatch")
    if result.get("request_id") != request.get("request_id") or result.get("request_fingerprint") != request.get("fingerprint"):
        raise ContractError("external evidence request/result linkage mismatch")
    if result.get("result_fingerprint") != result_fingerprint(result):
        raise ContractError("external evidence result fingerprint mismatch")
    if secret_hits(result):
        raise ContractError("external evidence result contains sensitive data")
    redaction = result.get("redaction_declaration")
    if not isinstance(redaction, dict) or any(redaction.get(key) is not True for key in ("secrets_removed", "private_rows_excluded", "raw_dumps_excluded")):
        raise ContractError("external evidence redaction declaration is incomplete")
    result_ref = external_result_path.resolve().relative_to(root.resolve()).as_posix()
    source_events = [entry for entry in read_jsonl(ledger_path) if entry.get("producer") == "import_external_evidence" and entry.get("gate") == "VALIDATING_EVIDENCE" and entry.get("status") == "PASS" and entry.get("story_id") == result.get("story_id") and entry.get("run_id") == result.get("run_id") and entry.get("iteration") == result.get("iteration") and entry.get("generation") == result.get("generation") and entry.get("request_id") == request.get("request_id") and entry.get("request_fingerprint") == request.get("fingerprint") and entry.get("result_fingerprint") == result.get("result_fingerprint") and entry.get("artifact_ref") == result_ref]
    if len(source_events) != 1:
        raise ContractError("external evidence result is not bound to exactly one PASS import event")
    validate_result_provenance(root, require_object(load_json(evidence_reuse_path), "evidence reuse result"), evidence_reuse_path, expected_producer="relink_external_evidence", expected_gate="VALIDATING_EVIDENCE", expected_frozen_artifacts=frozen, ledger_path=ledger_path, **expected)
    semantic = _terminal_artifact(semantic_path, "FINAL_SEMANTIC_COMPARISON")
    comparison = semantic.get("comparable_result")
    normalizations = semantic.get("normalization_contract")
    if semantic.get("status") != "PASS" or semantic.get("terminal_marker") != "FINAL_RESTORE_MATCH_OK" or not isinstance(comparison, dict) or comparison.get("exact_match") is not True or comparison.get("unclassified_difference_count") != 0 or not isinstance(normalizations, list) or {item.get("id") for item in normalizations if isinstance(item, dict)} != SEMANTIC_NORMALIZATIONS:
        raise ContractError("terminal semantic comparison is incomplete or changed")
    realtime = _terminal_artifact(realtime_path, "FINAL_REALTIME_VERIFICATION")
    verification = realtime.get("verification")
    plan = realtime.get("regenerated_plan")
    if realtime.get("status") != "PASS" or not isinstance(verification, dict) or not isinstance(plan, dict) or verification.get("source_target_leadflow_membership_exact_match") is not True or plan.get("alter_publication_count") != 0:
        raise ContractError("terminal Realtime verification is incomplete")
    negative_lines = [line.strip() for line in negative_cases_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    expected_cases = {f"NC-{index:02d}" for index in range(1, 11)}
    if len(negative_lines) != 10 or {line.split(" ", 1)[0] for line in negative_lines} != expected_cases or any("expected=FAIL observed=FAIL" not in line for line in negative_lines):
        raise ContractError("negative-case result is not the required 10/10 PASS set")
    required_items = {item.get("id") for item in request.get("evidence_items", []) if isinstance(item, dict) and item.get("required") is True}
    submitted_items = {item.get("id") for item in result.get("evidence_items", []) if isinstance(item, dict) and item.get("references")}
    required_postconditions = {item.get("id") for item in request.get("postconditions", []) if isinstance(item, dict) and item.get("required") is not False}
    passed_postconditions = {item.get("id") for item in result.get("postcondition_results", []) if isinstance(item, dict) and item.get("status") == "PASS"}
    if required_items - submitted_items or required_postconditions - passed_postconditions:
        raise ContractError("required operational evidence or postconditions are incomplete")
    stale_names = {"source-target-diff.txt", "realtime-reconcile.log"}
    if any(name in json_text for name in stale_names for json_text in [str(result.get("evidence_items")), str(result.get("postcondition_results"))]):
        raise ContractError("stale attempt artifact was selected as terminal evidence")
    return {
        "status": "PASS",
        "review_type": "OPERATIONAL_EVIDENCE_REVIEW",
        "reviewer_runtime_independence": "context_isolated_same_runtime",
        "findings": [],
        "evidence_refs": [source_events[0]["evidence_id"]],
        "ac_coverage": [{"ac": f"AC{number}", "status": "PASS"} for number in range(1, 6)],
        "external_execution_claim": "ATTESTED_ONLY_NO_REMOTE_EXECUTION",
        "terminal_artifacts": {
            "semantic_sha256": sha256_file(semantic_path),
            "realtime_sha256": sha256_file(realtime_path),
            "negative_cases_sha256": sha256_file(negative_cases_path),
        },
        "workspace_fingerprint": workspace_fingerprint(root),
        "checked_at": now_utc(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["validation", "operational-evidence-review"], default="validation")
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--result-input", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    parser.add_argument("--request", type=Path)
    parser.add_argument("--external-result", type=Path)
    parser.add_argument("--evidence-reuse", type=Path)
    parser.add_argument("--semantic", type=Path)
    parser.add_argument("--realtime", type=Path)
    parser.add_argument("--negative-cases", type=Path)
    args = parser.parse_args()
    try:
        root = args.project_root.resolve()
        expected = {
            "story_id": args.story_id,
            "run_id": args.run_id,
            "iteration": args.iteration,
            "generation": args.generation,
            "input_fingerprint": args.input_fingerprint,
            "story_fingerprint": args.story_fingerprint,
        }
        validate_registered_frozen_artifact(
            root,
            args.plan.resolve(),
            expected_kind="validation_plan",
            expected_story_id=args.story_id,
            expected_run_id=args.run_id,
            expected_iteration=args.iteration,
            expected_generation=args.generation,
            expected_input_fingerprint=args.input_fingerprint,
            expected_story_fingerprint=args.story_fingerprint,
        )
        frozen = validate_required_frozen_artifacts(root, **expected)
        if args.mode == "validation":
            if args.result_input is None:
                raise ContractError("--result-input is required for validation mode")
            evaluated = evaluate_checks(load_json(args.plan), require_object(load_json(args.result_input), "validation result"))
            evaluated["workspace_fingerprint"] = workspace_fingerprint(root)
            evaluated["checked_at"] = now_utc()
            producer, gate, refs = "validation_gate", "VALIDATING", [f"EV-VALIDATION-{args.story_id}-{args.run_id}-{args.iteration}-{args.generation}"]
        else:
            required = {"request": args.request, "external_result": args.external_result, "evidence_reuse": args.evidence_reuse, "semantic": args.semantic, "realtime": args.realtime, "negative_cases": args.negative_cases}
            if any(path is None for path in required.values()):
                raise ContractError("operational evidence review requires request, external result, reuse, semantic, realtime and negative-case artifacts")
            evaluated = evaluate_operational_evidence_review(root, request_path=args.request.resolve(), external_result_path=args.external_result.resolve(), evidence_reuse_path=args.evidence_reuse.resolve(), semantic_path=args.semantic.resolve(), realtime_path=args.realtime.resolve(), negative_cases_path=args.negative_cases.resolve(), expected={f"expected_{key}": value for key, value in expected.items()}, frozen=frozen, ledger_path=args.ledger.resolve())
            producer, gate, refs = "independent_reviewer", "REVIEWING", [f"EV-OPERATIONAL-EVIDENCE-REVIEW-{args.story_id}-{args.run_id}-{args.iteration}-{args.generation}"]
        output_relative = args.output.resolve().relative_to(root)
        ledger_relative = args.ledger.resolve().relative_to(root)
        output = attach_provenance(evaluated, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint, frozen_artifacts=frozen, evidence_ledger=ledger_relative.as_posix(), evidence_refs=refs, producer=producer, gate=gate, result_artifact_ref=output_relative.as_posix())
        write_json_atomic(args.output, output)
        append_jsonl(args.ledger, {"evidence_id": refs[0], "story_id": args.story_id, "run_id": args.run_id, "iteration": args.iteration, "generation": args.generation, "input_fingerprint": args.input_fingerprint, "story_fingerprint": args.story_fingerprint, "producer": producer, "gate": gate, "artifact_ref": output_relative.as_posix(), "result_fingerprint": output["provenance"]["result_fingerprint"], "frozen_artifacts": frozen, "status": output["status"], "workspace_fingerprint": output["workspace_fingerprint"], "timestamp": output["checked_at"]})
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
        return 0 if output["status"] == "PASS" else 1
    except (ContractError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
