#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Validate LLM proposals and freeze controller-owned execution artifacts."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    EXECUTION_TYPES,
    PATH_CATEGORIES,
    SHA256_RE,
    artifact_kind,
    canonical_hash,
    canonical_relative,
    classify_workflow_mode,
    discover_protected_paths,
    extract_story_id,
    frozen_fingerprint,
    load_json,
    now_utc,
    require_object,
    require_story_id,
    require_string,
    root_runtime,
    sha256_file,
    validate_source_refs,
    write_json_atomic,
)


def _validate_run_context(proposal: dict[str, Any]) -> dict[str, Any]:
    run_id = require_string(proposal.get("run_id"), "run_id")
    iteration = proposal.get("iteration")
    generation = proposal.get("generation")
    if not isinstance(iteration, int) or iteration < 0 or not isinstance(generation, int) or generation < 0:
        raise ContractError("iteration and generation must be non-negative integers")
    input_fingerprint = require_string(proposal.get("input_fingerprint"), "input_fingerprint")
    story_fingerprint = require_string(proposal.get("story_fingerprint"), "story_fingerprint")
    if not SHA256_RE.fullmatch(input_fingerprint) or not SHA256_RE.fullmatch(story_fingerprint):
        raise ContractError("input_fingerprint and story_fingerprint must be SHA256 values")
    return {
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
    }


def _list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ContractError(f"{label} must be an array")
    return value


def validate_execution_proposal(root: Path, proposal: dict[str, Any]) -> dict[str, Any]:
    if proposal.get("schema_version") != "1.0":
        raise ContractError("execution proposal schema_version must be 1.0")
    story_id = require_story_id(proposal.get("story_id"))
    context = _validate_run_context(proposal)
    execution_type = require_string(proposal.get("execution_type"), "execution_type").upper()
    if execution_type not in EXECUTION_TYPES:
        raise ContractError(f"invalid execution_type: {execution_type}")
    basis = require_object(proposal.get("classification_basis"), "classification_basis")
    gates = require_object(proposal.get("required_gates"), "required_gates")
    expected = {
        "IMPLEMENTATION": (True, False),
        "OPERATIONAL": (False, True),
        "HYBRID": (True, True),
    }[execution_type]
    if (gates.get("implementation"), gates.get("external_evidence")) != expected:
        raise ContractError("required_gates contradict execution_type")
    if gates.get("validation") is not True or gates.get("review") is not True:
        raise ContractError("validation and review gates are always required")
    if execution_type == "IMPLEMENTATION" and basis.get("requires_external_evidence") is True:
        raise ContractError("implementation proposal contradicts external evidence basis")
    if execution_type == "OPERATIONAL" and basis.get("requires_application_code") is True:
        raise ContractError("operational proposal contradicts application-code basis")
    sources = validate_source_refs(root, proposal.get("source_refs", []))
    final = dict(proposal)
    final.update({"schema_version": "1.0", "story_id": story_id, "execution_type": execution_type, "source_refs": sources, **context})
    story_source = None
    for source in sources:
        candidate = root / source
        if not candidate.exists():
            continue
        try:
            if extract_story_id(candidate.read_text(encoding="utf-8")) == story_id:
                story_source = candidate
                break
        except OSError as exc:
            raise ContractError(f"cannot read execution story source: {candidate}") from exc
        except ContractError:
            continue
    if story_source is None:
        raise ContractError("execution proposal must reference an existing story source matching story_id")
    route = classify_workflow_mode(
        story_text=story_source.read_text(encoding="utf-8"),
        execution_type=execution_type,
        external_evidence_required=gates.get("external_evidence") is True,
    )
    final.update({"workflow_mode": route["workflow_mode"], "workflow_mode_reasons": route["reasons"]})
    return final


def validate_validation_proposal(root: Path, proposal: dict[str, Any]) -> dict[str, Any]:
    if proposal.get("schema_version") != "1.0":
        raise ContractError("validation proposal schema_version must be 1.0")
    story_id = require_story_id(proposal.get("story_id"))
    context = _validate_run_context(proposal)
    execution_type = require_string(proposal.get("execution_type"), "execution_type").upper()
    if execution_type not in EXECUTION_TYPES:
        raise ContractError("invalid execution_type")
    checks = _list(proposal.get("checks"), "checks")
    seen: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for raw in checks:
        check = require_object(raw, "check")
        check_id = require_string(check.get("check_id"), "check.check_id")
        if check_id in seen:
            raise ContractError(f"duplicate validation check: {check_id}")
        seen.add(check_id)
        requirement = require_string(check.get("requirement"), f"{check_id}.requirement").upper()
        if requirement not in {"REQUIRED", "CONDITIONAL", "NOT_APPLICABLE"}:
            raise ContractError(f"invalid requirement for {check_id}")
        justification = require_string(check.get("justification"), f"{check_id}.justification")
        if requirement == "NOT_APPLICABLE" and not justification:
            raise ContractError(f"NOT_APPLICABLE requires justification: {check_id}")
        if requirement == "CONDITIONAL" and not isinstance(check.get("condition"), dict):
            raise ContractError(f"CONDITIONAL requires condition: {check_id}")
        if check.get("destructive") is True:
            raise ContractError(f"destructive validation command is forbidden: {check_id}")
        command = check.get("command")
        if command is not None and not isinstance(command, str):
            raise ContractError(f"command must be string or null: {check_id}")
        normalized.append(dict(check))
    final = dict(proposal)
    final.update({"schema_version": "1.0", "story_id": story_id, "execution_type": execution_type, "checks": normalized, **context})
    return final


def _entry(raw: Any) -> dict[str, Any]:
    entry = require_object(raw, "path entry")
    path = require_string(entry.get("path"), "path entry.path")
    category = require_string(entry.get("category"), f"{path}.category").upper()
    if category not in PATH_CATEGORIES:
        raise ContractError(f"invalid path category: {category}")
    justification = require_string(entry.get("justification"), f"{path}.justification")
    return {**entry, "path": path, "category": category, "justification": justification}


def validate_scope_proposal(root: Path, proposal: dict[str, Any]) -> dict[str, Any]:
    if proposal.get("schema_version") != "1.0":
        raise ContractError("scope proposal schema_version must be 1.0")
    story_id = require_story_id(proposal.get("story_id"))
    context = _validate_run_context(proposal)
    baseline_commit = require_string(proposal.get("baseline_commit"), "baseline_commit")
    raw_entries = _list(proposal.get("path_classification"), "path_classification")
    entries: dict[str, dict[str, Any]] = {}
    for raw in raw_entries:
        item = _entry(raw)
        resolved, relative = canonical_relative(root, item["path"], allow_new=bool(item.get("new", False)))
        if item["category"] in {"NORMATIVE_FORBIDDEN", "SECRET_FORBIDDEN", "READ_ONLY_CONTEXT", "CONTROLLER_ONLY"} and not resolved.exists() and not item.get("new", False):
            raise ContractError(f"protected path does not exist: {relative}")
        if relative in entries and entries[relative]["category"] != item["category"]:
            raise ContractError(f"path has multiple categories: {relative}")
        entries[relative] = {**item, "path": relative, "exists": resolved.exists()}

    discovered = discover_protected_paths(root, story_id)
    for item in discovered:
        existing = entries.get(item["path"])
        if existing and existing["category"] in {"DEV_WRITABLE", "FIXER_WRITABLE"}:
            raise ContractError(f"writable proposal includes protected path: {item['path']}")
        if existing and existing["category"] != item["category"]:
            raise ContractError(f"path conflicts with discovered protection: {item['path']}")
        entries[item["path"]] = item

    for item in entries.values():
        if item["category"] in {"DEV_WRITABLE", "FIXER_WRITABLE"} and item["path"] in {protected["path"] for protected in discovered if protected["category"] in {"NORMATIVE_FORBIDDEN", "SECRET_FORBIDDEN"}}:
            raise ContractError(f"writable path overlaps forbidden path: {item['path']}")

    exact_allowed = sorted(item["path"] for item in entries.values() if item["category"] in {"DEV_WRITABLE", "FIXER_WRITABLE"} and not item.get("prefix", False))
    prefixes_allowed = [
        {
            "path": item["path"],
            "category": item["category"],
            "justification": item["justification"],
        }
        for item in sorted(entries.values(), key=lambda value: value["path"])
        if item["category"] in {"DEV_WRITABLE", "FIXER_WRITABLE", "CONTROLLER_ONLY"} and item.get("prefix", False)
    ]
    generated = sorted(item["path"] for item in entries.values() if item["category"] == "CONTROLLER_ONLY" and item.get("generated_artifact", False))
    forbidden = sorted(item["path"] for item in entries.values() if item["category"] in {"NORMATIVE_FORBIDDEN", "SECRET_FORBIDDEN"})
    normative = sorted(item["path"] for item in entries.values() if item["category"] == "NORMATIVE_FORBIDDEN")
    return {
        "schema_version": "1.0",
        "story_id": story_id,
        "baseline_commit": baseline_commit,
        "exact_paths_allowed": exact_allowed,
        "path_prefixes_allowed": prefixes_allowed,
        "generated_artifacts_allowed": generated,
        "forbidden_paths": forbidden,
        "normative_paths": normative,
        "path_classification": [entries[key] for key in sorted(entries)],
        "source_refs": validate_source_refs(root, proposal.get("source_refs", [])),
        **context,
    }


def freeze(kind: str, root: Path, proposal_path: Path, output_path: Path) -> dict[str, Any]:
    if proposal_path.resolve() == output_path.resolve():
        raise ContractError("proposal and frozen artifact must be different files")
    if output_path.exists():
        raise ContractError(f"frozen artifact already exists: {output_path}")
    proposal = require_object(load_json(proposal_path), "proposal")
    canonical_kind = artifact_kind(kind)
    expected_name = {
        "story_execution_type": "story_execution_type.json",
        "validation_plan": "validation-plan.json",
        "scope_manifest": "scope-manifest.json",
    }[canonical_kind]
    if output_path.name != expected_name:
        raise ContractError(f"frozen {canonical_kind} must be written as {expected_name}")
    if kind in {"execution-type", "story_execution_type"}:
        final = validate_execution_proposal(root, proposal)
    elif kind in {"validation-plan", "validation_plan"}:
        final = validate_validation_proposal(root, proposal)
    elif kind in {"scope-manifest", "scope_manifest"}:
        final = validate_scope_proposal(root, proposal)
    else:
        raise ContractError(f"unsupported artifact kind: {kind}")
    final["frozen"] = True
    final["frozen_at"] = now_utc()
    final["fingerprint"] = frozen_fingerprint(final)
    write_json_atomic(output_path, final)

    runtime = root_runtime(root)
    registry_path = runtime / "frozen-artifacts.json"
    if registry_path.exists():
        registry = require_object(load_json(registry_path), "frozen-artifacts registry")
    else:
        registry = {"schema_version": "1.0", "artifacts": {}}
    artifacts = registry.setdefault("artifacts", {})
    try:
        output_relative = output_path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("frozen artifact output must be inside project root") from exc
    _, relative = canonical_relative(root, output_relative, allow_new=False)
    artifacts[relative] = {
        "kind": canonical_kind,
        "file_sha256": sha256_file(output_path),
        "fingerprint": final["fingerprint"],
        "frozen_at": final["frozen_at"],
        "story_id": final["story_id"],
        "run_id": final["run_id"],
        "iteration": final["iteration"],
        "generation": final["generation"],
        "input_fingerprint": final["input_fingerprint"],
        "story_fingerprint": final["story_fingerprint"],
    }
    write_json_atomic(registry_path, registry)
    return {"status": "PASS", "kind": kind, "output": relative, "fingerprint": final["fingerprint"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=["execution-type", "validation-plan", "scope-manifest"])
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--proposal", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(__import__("json").dumps(freeze(args.kind, args.project_root.resolve(), args.proposal.resolve(), args.output.resolve()), ensure_ascii=False, sort_keys=True))
        return 0
    except ContractError as exc:
        print(__import__("json").dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
