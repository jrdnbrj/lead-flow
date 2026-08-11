#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Validate ledger-bound provenance and atomically project implementation DONE."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    SHA256_RE,
    append_jsonl,
    canonical_hash,
    canonical_relative,
    ensure_story_in_state,
    extract_story_id,
    load_json,
    now_utc,
    parse_timestamp,
    project_bmad_status,
    read_jsonl,
    result_fingerprint,
    sha256_file,
    validate_registered_frozen_artifact,
    validate_required_frozen_artifacts,
    validate_result_provenance,
    validate_state_shape,
    workspace_fingerprint,
    write_bytes_atomic,
    write_json_atomic,
)
from validation_gate import evaluate_checks


RESULT_SPECS = {
    "validation": ("validation_gate", "VALIDATING"),
    "scope": ("scope_gate", "SCOPE_GATE"),
    "final_scope": ("scope_gate", "FINAL_SCOPE_GATE"),
    "readiness": ("handoff_gate", "HANDOFF"),
    "dependency": ("dependency_gate", "DEPENDENCY_GATE"),
}
REVIEW_WAIVER_STATUS = "WAIVED_UNAVAILABLE_RUNTIME"


def _load_registered_result(
    root: Path,
    path: Path,
    *,
    producer: str,
    gate: str,
    expected: dict[str, Any],
    frozen: dict[str, Any],
    ledger_path: Path,
    expected_status: str = "PASS",
) -> dict[str, Any]:
    result = load_json(path)
    validate_result_provenance(root, result, path, expected_producer=producer, expected_gate=gate, expected_status=expected_status, expected_frozen_artifacts=frozen, ledger_path=ledger_path, **expected)
    return result


def _load_review_or_project_fast_waiver(root: Path, path: Path, *, expected: dict[str, Any], frozen: dict[str, Any], ledger_path: Path) -> dict[str, Any]:
    try:
        return _load_registered_result(
            root,
            path,
            producer="independent_reviewer",
            gate="REVIEWING",
            expected=expected,
            frozen=frozen,
            ledger_path=ledger_path,
        )
    except ContractError as review_error:
        try:
            waiver = _load_registered_result(
                root,
                path,
                producer="project_fast_policy",
                gate="PROJECT_FAST",
                expected=expected,
                frozen=frozen,
                ledger_path=ledger_path,
                expected_status=REVIEW_WAIVER_STATUS,
            )
        except ContractError:
            raise review_error
    if waiver.get("review") != REVIEW_WAIVER_STATUS:
        raise ContractError("PROJECT_FAST review waiver declaration is missing")
    if waiver.get("runtime_independence_available") is not False:
        raise ContractError("PROJECT_FAST review waiver requires unavailable reviewer independence")
    if waiver.get("validations_required_pass") is not True:
        raise ContractError("PROJECT_FAST review waiver requires required validations PASS")
    if waiver.get("known_p0_p1_open") not in (False, []):
        raise ContractError("PROJECT_FAST review waiver cannot be used with known open P0/P1 findings")
    if waiver.get("product_decision_pending") is not False or waiver.get("architecture_decision_pending") is not False:
        raise ContractError("PROJECT_FAST review waiver cannot bypass a product or architecture decision")
    if waiver.get("remote_or_destructive_operation_pending") is not False:
        raise ContractError("PROJECT_FAST review waiver cannot bypass remote or destructive operations")
    return waiver


def _load_gate_inputs(
    root: Path,
    ledger_path: Path,
    *,
    paths: dict[str, Path],
    expected: dict[str, Any],
    frozen: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    registered_plan = validate_registered_frozen_artifact(
        root,
        paths["validation_plan"],
        expected_kind="validation_plan",
        expected_story_id=expected["expected_story_id"],
        expected_run_id=expected["expected_run_id"],
        expected_iteration=expected["expected_iteration"],
        expected_generation=expected["expected_generation"],
        expected_input_fingerprint=expected["expected_input_fingerprint"],
        expected_story_fingerprint=expected["expected_story_fingerprint"],
    )
    validation_plan = load_json(paths["validation_plan"])
    if validation_plan.get("fingerprint") != registered_plan["fingerprint"]:
        raise ContractError("DONE_GATE validation plan is not the registered frozen content")
    results: dict[str, dict[str, Any]] = {}
    for label, (producer, gate) in RESULT_SPECS.items():
        results[label] = _load_registered_result(
            root,
            paths[label],
            producer=producer,
            gate=gate,
            expected=expected,
            frozen=frozen,
            ledger_path=ledger_path,
        )
    results["review"] = _load_review_or_project_fast_waiver(root, paths["review"], expected=expected, frozen=frozen, ledger_path=ledger_path)
    return validation_plan, registered_plan, results


def _assert_workspace_consistency(root: Path, validation: dict[str, Any], review: dict[str, Any], final_scope: dict[str, Any]) -> None:
    validation_fingerprint, validation_at = _workspace_evidence(validation, "validation")
    review_fingerprint, review_at = _workspace_evidence(review, "review")
    final_fingerprint, final_at = _workspace_evidence(final_scope, "final scope")
    current_fingerprint = workspace_fingerprint(root)
    if final_fingerprint != current_fingerprint:
        raise ContractError("workspace changed after FINAL_SCOPE_GATE")
    if validation_fingerprint != final_fingerprint or review_fingerprint != final_fingerprint:
        raise ContractError("workspace changed after validation or review; revalidation is required")
    if final_at < validation_at or final_at < review_at:
        raise ContractError("FINAL_SCOPE_GATE predates the latest validation or review")


def _open_findings(review: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    for finding in review.get("findings", []):
        if not isinstance(finding, dict):
            failures.append("invalid review finding")
            continue
        severity = str(finding.get("severity", "")).upper()
        disposition = str(finding.get("status") or finding.get("disposition") or "").upper()
        if severity in {"P0", "P1", "P2"} and disposition not in {"RESOLVED", "DISMISSED_WITH_EVIDENCE"}:
            failures.append(f"open {severity} finding: {finding.get('id', '<unknown>')}")
    return failures


def _relative_path(root: Path, path: Path) -> str:
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("path is outside project root") from exc
    _, normalized = canonical_relative(root, relative, allow_new=False)
    return normalized


def _assert_story_file_binding(root: Path, story: dict[str, Any], story_file: Path, story_id: str, story_fingerprint: str) -> None:
    registered = story.get("story_file")
    if not isinstance(registered, str) or not registered.strip():
        raise ContractError("story_file is not registered for the target story")
    registered_relative = _relative_path(root, root / registered)
    actual_relative = _relative_path(root, story_file)
    if registered_relative != actual_relative:
        raise ContractError(f"story_file does not match registered path: {actual_relative} != {registered_relative}")
    actual_fingerprint = sha256_file(story_file)
    if actual_fingerprint != story_fingerprint:
        raise ContractError("story_file changed after the candidate fingerprint was captured")
    if extract_story_id(story_file.read_text(encoding="utf-8")) != story_id:
        raise ContractError("story Markdown does not correspond to the target story_id")


def _workspace_evidence(result: dict[str, Any], label: str) -> tuple[str, Any]:
    fingerprint = result.get("workspace_fingerprint")
    if not isinstance(fingerprint, str) or not SHA256_RE.fullmatch(fingerprint):
        raise ContractError(f"{label} result is missing workspace_fingerprint")
    checked_at = result.get("checked_at")
    if not isinstance(checked_at, str):
        raise ContractError(f"{label} result is missing checked_at")
    return fingerprint, parse_timestamp(checked_at)


def evaluate_predicates(
    *,
    project_root: Path,
    state_path: Path,
    story_file: Path,
    ledger_path: Path,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
    validation_plan_path: Path,
    validation_result_path: Path,
    review_result_path: Path,
    scope_result_path: Path,
    final_scope_result_path: Path,
    readiness_result_path: Path,
    dependency_result_path: Path,
) -> dict[str, Any]:
    root = project_root.resolve()
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    failures: list[str] = []
    if story.get("status") not in {"REVIEWING", "CANDIDATE_DONE"}:
        failures.append(f"story must be REVIEWING or CANDIDATE_DONE, got {story.get('status')}")
    _assert_story_file_binding(root, story, story_file, story_id, story_fingerprint)
    expected = {
        "expected_story_id": story_id,
        "expected_run_id": run_id,
        "expected_iteration": iteration,
        "expected_generation": generation,
        "expected_input_fingerprint": input_fingerprint,
        "expected_story_fingerprint": story_fingerprint,
    }
    frozen = validate_required_frozen_artifacts(root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation, input_fingerprint=input_fingerprint, story_fingerprint=story_fingerprint)
    paths = {
        "validation_plan": validation_plan_path,
        "validation": validation_result_path,
        "review": review_result_path,
        "scope": scope_result_path,
        "final_scope": final_scope_result_path,
        "readiness": readiness_result_path,
        "dependency": dependency_result_path,
    }
    validation_plan, _, results = _load_gate_inputs(root, ledger_path, paths=paths, expected=expected, frozen=frozen)
    validation = results["validation"]
    review = results["review"]
    scope = results["scope"]
    final_scope = results["final_scope"]
    readiness = results["readiness"]
    dependency = results["dependency"]
    validation_check = evaluate_checks(validation_plan, validation)
    if validation_check["status"] != "PASS":
        failures.extend(validation_check["failures"])
    for label, result in (("scope", scope), ("final_scope", final_scope), ("readiness", readiness), ("dependency", dependency)):
        if result.get("status") != "PASS":
            failures.append(f"{label} result is not PASS")
    if review.get("status") not in {"PASS", REVIEW_WAIVER_STATUS}:
        failures.append("review result is neither PASS nor PROJECT_FAST waiver")
    try:
        _assert_workspace_consistency(root, validation, review, final_scope)
    except ContractError as exc:
        failures.append(str(exc))
    failures.extend(_open_findings(review))
    return {
        "status": "PASS" if not failures else "FAIL",
        "failures": failures,
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
        "frozen_artifacts": frozen,
        "evidence_refs": [
            *validation["provenance"]["evidence_refs"],
            *review["provenance"]["evidence_refs"],
            *scope["provenance"]["evidence_refs"],
            *final_scope["provenance"]["evidence_refs"],
            *readiness["provenance"]["evidence_refs"],
            *dependency["provenance"]["evidence_refs"],
        ],
        "validation": validation_check,
        "input_paths": {key: _relative_path(root, value) for key, value in paths.items()},
    }


def project_story_done(story_file: Path) -> None:
    content = story_file.read_text(encoding="utf-8")
    updated, _ = project_bmad_status(content, "done")
    write_bytes_atomic(story_file, updated.encode("utf-8"))


def _recheck_current_done_inputs(
    root: Path,
    state_path: Path,
    story_file: Path,
    ledger_path: Path,
    predicates: dict[str, Any],
) -> None:
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, predicates["story_id"])
    if story.get("status") not in {"REVIEWING", "CANDIDATE_DONE"}:
        raise ContractError("story is no longer eligible for atomic completion")
    _assert_story_file_binding(root, story, story_file, predicates["story_id"], predicates["story_fingerprint"])
    expected = {
        "expected_story_id": predicates["story_id"],
        "expected_run_id": predicates["run_id"],
        "expected_iteration": predicates["iteration"],
        "expected_generation": predicates["generation"],
        "expected_input_fingerprint": predicates["input_fingerprint"],
        "expected_story_fingerprint": predicates["story_fingerprint"],
    }
    frozen = validate_required_frozen_artifacts(root, story_id=predicates["story_id"], run_id=predicates["run_id"], iteration=predicates["iteration"], generation=predicates["generation"], input_fingerprint=predicates["input_fingerprint"], story_fingerprint=predicates["story_fingerprint"])
    if frozen != predicates.get("frozen_artifacts"):
        raise ContractError("frozen artifacts changed after DONE predicates were evaluated")
    raw_paths = predicates.get("input_paths")
    if not isinstance(raw_paths, dict) or set(raw_paths) != set(("validation_plan", "validation", "review", "scope", "final_scope", "readiness", "dependency")):
        raise ContractError("DONE predicates are missing registered input paths")
    paths = {key: root / value for key, value in raw_paths.items()}
    validation_plan, _, results = _load_gate_inputs(root, ledger_path, paths=paths, expected=expected, frozen=frozen)
    validation_check = evaluate_checks(validation_plan, results["validation"])
    if validation_check["status"] != "PASS":
        raise ContractError("validation is no longer PASS")
    if _open_findings(results["review"]):
        raise ContractError("review has open findings")
    _assert_workspace_consistency(root, results["validation"], results["review"], results["final_scope"])


def _restore(path: Path, before: bytes | None) -> None:
    if before is None:
        if path.exists():
            path.unlink()
    else:
        write_bytes_atomic(path, before)


def apply_done(
    *,
    project_root: Path,
    state_path: Path,
    story_file: Path,
    ledger_path: Path,
    predicates: dict[str, Any],
) -> dict[str, Any]:
    if predicates.get("status") != "PASS":
        raise ContractError("DONE predicates are not PASS")
    state_before = state_path.read_bytes() if state_path.exists() else None
    story_before = story_file.read_bytes() if story_file.exists() else None
    ledger_before = ledger_path.read_bytes() if ledger_path.exists() else None
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, predicates["story_id"])
    if story.get("status") not in {"REVIEWING", "CANDIDATE_DONE"}:
        raise ContractError("only REVIEWING or CANDIDATE_DONE can become DONE")
    root = project_root.resolve()
    _recheck_current_done_inputs(root, state_path, story_file, ledger_path, predicates)
    # Validate the projection before appending evidence so malformed stories cannot create partial truth.
    project_bmad_status(story_file.read_text(encoding="utf-8"), "done")
    _, state_ref = canonical_relative(root, state_path.resolve().relative_to(root), allow_new=False)
    done_event = {
        "evidence_id": f"EV-DONE-{predicates['story_id']}-{predicates['run_id']}-{predicates['iteration']}-{predicates['generation']}",
        "kind": "DONE_GATE",
        "status": "PASS",
        "story_id": predicates["story_id"],
        "run_id": predicates["run_id"],
        "iteration": predicates["iteration"],
        "generation": predicates["generation"],
        "input_fingerprint": predicates["input_fingerprint"],
        "story_fingerprint": predicates["story_fingerprint"],
        "producer": "done_gate",
        "gate": "DONE_GATE",
        "completion_mode": "ATOMIC",
        "artifact_ref": state_ref,
        "frozen_artifacts": predicates["frozen_artifacts"],
        "timestamp": now_utc(),
    }
    done_event["result_fingerprint"] = canonical_hash(done_event)
    try:
        append_jsonl(ledger_path, done_event)
        story["status"] = "DONE"
        story["done_at"] = done_event["timestamp"]
        story.setdefault("evidence_refs", []).append(done_event["evidence_id"])
        story["done_evidence"] = {"evidence_id": done_event["evidence_id"], "status": "PASS", "frozen_artifacts": predicates["frozen_artifacts"]}
        state["revision"] = int(state.get("revision", 0)) + 1
        state["runtime_status"] = "IDLE"
        state["active_story_id"] = None
        write_json_atomic(state_path, state)
        project_story_done(story_file)
        return {"status": "DONE", "story_id": predicates["story_id"], "evidence_id": done_event["evidence_id"], "revision": state["revision"]}
    except Exception as exc:
        try:
            _restore(state_path, state_before)
            _restore(story_file, story_before)
            _restore(ledger_path, ledger_before)
        except Exception as restore_exc:
            raise ContractError(f"DONE transaction failed and rollback failed: {restore_exc}") from exc
        raise ContractError(f"DONE transaction rolled back: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--story-file", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    parser.add_argument("--validation-plan", required=True, type=Path)
    parser.add_argument("--validation-result", required=True, type=Path)
    parser.add_argument("--review-result", required=True, type=Path)
    parser.add_argument("--scope-result", required=True, type=Path)
    parser.add_argument("--final-scope-result", required=True, type=Path)
    parser.add_argument("--readiness-result", required=True, type=Path)
    parser.add_argument("--dependency-result", required=True, type=Path)
    args = parser.parse_args()
    try:
        predicates = evaluate_predicates(project_root=args.project_root, state_path=args.state, story_file=args.story_file, ledger_path=args.ledger, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint, validation_plan_path=args.validation_plan, validation_result_path=args.validation_result, review_result_path=args.review_result, scope_result_path=args.scope_result, final_scope_result_path=args.final_scope_result, readiness_result_path=args.readiness_result, dependency_result_path=args.dependency_result)
        if predicates["status"] != "PASS":
            print(json.dumps(predicates, ensure_ascii=False, sort_keys=True))
            return 1
        print(json.dumps(apply_done(project_root=args.project_root, state_path=args.state, story_file=args.story_file, ledger_path=args.ledger, predicates=predicates), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
