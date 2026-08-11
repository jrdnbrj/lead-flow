#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Validate external evidence references without pretending unverifiable data was hashed."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any

from lib import ContractError, SHA256_RE, append_jsonl, canonical_hash, canonical_relative, discover_protected_paths, frozen_fingerprint, load_json, now_utc, parse_timestamp, read_jsonl, require_object, require_story_id, result_fingerprint, secret_hits, sha256_file, root_runtime, write_json_atomic


REFERENCE_TYPES = {"LOCAL_ARTIFACT", "EXTERNAL_ARTIFACT", "EXTERNAL_ID"}
EXTERNAL_VERIFICATION_MODES = {"HUMAN_ATTESTED", "REFERENCE_ONLY"}


def _items(value: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ContractError(f"{label} must be an array of objects")
    return value


def _reject_placeholders(value: Any, path: str = "") -> None:
    if isinstance(value, dict):
        if "reference_examples" in value:
            raise ContractError("reference_examples is documentation-only and cannot be submitted")
        for key, item in value.items():
            _reject_placeholders(item, f"{path}.{key}" if path else str(key))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _reject_placeholders(item, f"{path}[{index}]")
    elif isinstance(value, str) and "<FILL_" in value:
        raise ContractError(f"external evidence contains an unresolved placeholder at {path}")


def _verify_request(request: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    required = {"request_id", "story_id", "run_id", "iteration", "generation", "fingerprint", "evidence_items", "postconditions", "staleness_policy", "environment_policy", "local_artifact_policy"}
    if not required.issubset(request):
        raise ContractError("external evidence request is missing provenance fields")
    story_id = require_story_id(request["story_id"])
    if request["fingerprint"] != frozen_fingerprint(request):
        raise ContractError("external evidence request fingerprint mismatch")
    return story_id, request


def _load_registered_request(root: Path, request_path: Path, ledger_path: Path) -> dict[str, Any]:
    request_path = request_path.resolve()
    try:
        relative = request_path.relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("external evidence request is outside project root") from exc
    _, artifact_ref = canonical_relative(root, relative, allow_new=False)
    request = require_object(load_json(request_path), "external evidence request")
    story_id, request = _verify_request(request)
    registry_path = root_runtime(root) / "external-evidence-requests.json"
    registry = load_json(registry_path)
    if not isinstance(registry, dict) or not isinstance(registry.get("requests"), dict):
        raise ContractError("invalid external evidence request registry")
    entry = registry["requests"].get(request["request_id"])
    if not isinstance(entry, dict):
        raise ContractError("external evidence request is not controller-registered")
    expected = {
        "request_id": request["request_id"],
        "story_id": story_id,
        "run_id": request["run_id"],
        "iteration": request["iteration"],
        "generation": request["generation"],
        "artifact_ref": artifact_ref,
        "file_sha256": sha256_file(request_path),
        "request_fingerprint": request["fingerprint"],
    }
    for key, value in expected.items():
        if entry.get(key) != value:
            raise ContractError(f"registered external evidence request mismatch for {key}")
    if not isinstance(entry.get("created_at"), str) or not entry["created_at"]:
        raise ContractError("registered external evidence request is missing created_at")
    ledger_relative = canonical_relative(root, ledger_path.resolve().relative_to(root.resolve()), allow_new=False)[1]
    if entry.get("ledger_ref") != ledger_relative:
        raise ContractError("external evidence request ledger reference mismatch")
    events = [item for item in read_jsonl(ledger_path) if item.get("evidence_id") == entry.get("evidence_id")]
    if len(events) != 1:
        raise ContractError("external evidence request registration event is missing or duplicated")
    event = events[0]
    event_expected = {
        "status": "PASS",
        "producer": "register_external_evidence",
        "gate": "AWAITING_EXTERNAL_EVIDENCE",
        "request_id": request["request_id"],
        "story_id": story_id,
        "run_id": request["run_id"],
        "iteration": request["iteration"],
        "generation": request["generation"],
        "artifact_ref": artifact_ref,
        "file_sha256": expected["file_sha256"],
        "request_fingerprint": request["fingerprint"],
        "created_at": entry["created_at"],
    }
    for key, value in event_expected.items():
        if event.get(key) != value:
            raise ContractError(f"external evidence request ledger mismatch for {key}")
    event_copy = dict(event)
    event_fingerprint = event_copy.pop("event_fingerprint", None)
    if not isinstance(event_fingerprint, str) or event_fingerprint != canonical_hash(event_copy):
        raise ContractError("external evidence request registration event fingerprint mismatch")
    return request


def _scan_local_artifact(path: Path) -> None:
    raw = path.read_bytes()
    try:
        decoded = raw.decode("utf-8")
    except UnicodeDecodeError:
        decoded = ""
    if decoded and "-----BEGIN" in decoded:
        raise ContractError(f"secret material detected in local evidence artifact: {path}")
    try:
        parsed = json.loads(decoded) if decoded else None
    except json.JSONDecodeError:
        parsed = None
    if parsed is not None and secret_hits(parsed):
        raise ContractError(f"secret-bearing fields detected in local evidence artifact: {path}")


def _allowed_local(root: Path, ref: str, request: dict[str, Any]) -> tuple[Path, str]:
    path, relative = canonical_relative(root, ref, allow_new=False)
    policy = require_object(request.get("local_artifact_policy", {}), "local_artifact_policy")
    exact = set(policy.get("allowed_paths", []))
    prefixes = tuple(policy.get("allowed_prefixes", []))
    if relative not in exact and not any(relative == prefix or relative.startswith(str(prefix).rstrip("/") + "/") for prefix in prefixes):
        raise ContractError(f"LOCAL_ARTIFACT path is not allowed: {relative}")
    if any(item["path"] == relative and item["category"] == "SECRET_FORBIDDEN" for item in discover_protected_paths(root, request["story_id"])):
        raise ContractError(f"LOCAL_ARTIFACT path is secret-forbidden: {relative}")
    return path, relative


def _validate_reference(root: Path, request: dict[str, Any], reference: dict[str, Any]) -> dict[str, Any]:
    reference_type = str(reference.get("type", "")).upper()
    if reference_type not in REFERENCE_TYPES:
        raise ContractError(f"invalid evidence reference type: {reference_type}")
    ref = reference.get("ref")
    if not isinstance(ref, str) or not ref.strip():
        raise ContractError("evidence reference ref is required")
    if reference_type == "LOCAL_ARTIFACT":
        path, relative = _allowed_local(root, ref, request)
        declared = reference.get("sha256")
        if not isinstance(declared, str) or not SHA256_RE.fullmatch(declared):
            raise ContractError("LOCAL_ARTIFACT requires a SHA256 hash")
        actual = sha256_file(path)
        if actual != declared:
            raise ContractError(f"LOCAL_ARTIFACT hash mismatch: {relative}")
        _scan_local_artifact(path)
        return {"type": reference_type, "ref": relative, "sha256": declared, "verification_mode": "CRYPTOGRAPHIC", "hash_verified": True}
    mode = str(reference.get("verification_mode", "")).upper()
    if mode not in EXTERNAL_VERIFICATION_MODES:
        raise ContractError(f"external reference requires explicit verification_mode: {ref}")
    attestation = reference.get("attestation")
    if not isinstance(attestation, dict) or not attestation.get("performed_by") or not attestation.get("attested_at") or not attestation.get("method"):
        raise ContractError(f"external reference requires human attestation metadata: {ref}")
    if "sha256" in reference:
        raise ContractError("external reference cannot claim cryptographic SHA256 verification")
    return {
        "type": reference_type,
        "ref": ref,
        "verification_mode": mode,
        "hash_verified": False,
        "attestation": {"performed_by": attestation["performed_by"], "attested_at": attestation["attested_at"], "method": attestation["method"]},
    }


def validate(root: Path, request_path: Path, request: dict[str, Any], result: dict[str, Any], ledger_path: Path) -> dict[str, Any]:
    registered_request = _load_registered_request(root, request_path, ledger_path)
    if request != registered_request:
        raise ContractError("provided external evidence request differs from the registered request")
    _reject_placeholders(result)
    story_id, request = _verify_request(registered_request)
    if result.get("request_id") != request.get("request_id"):
        raise ContractError("external evidence request_id mismatch")
    if result.get("story_id") != story_id or result.get("run_id") != request.get("run_id"):
        raise ContractError("external evidence story_id/run_id mismatch")
    for key in ("iteration", "generation"):
        if result.get(key) != request.get(key):
            raise ContractError(f"external evidence mismatch for {key}")
    if result.get("request_fingerprint") != request["fingerprint"]:
        raise ContractError("external evidence request fingerprint mismatch")
    if result.get("result_fingerprint") != result_fingerprint(result):
        raise ContractError("external evidence result fingerprint mismatch")
    if secret_hits(result):
        raise ContractError("sensitive fields detected in external evidence result")
    redaction = result.get("redaction_declaration")
    if not isinstance(redaction, dict):
        raise ContractError("redaction_declaration is required")
    for field in ("secrets_removed", "private_rows_excluded", "raw_dumps_excluded"):
        if redaction.get(field) is not True:
            raise ContractError(f"redaction declaration incomplete: {field}")
    performed_at = parse_timestamp(result.get("performed_at"))
    policy = require_object(request.get("staleness_policy"), "staleness_policy")
    max_age = policy.get("max_age_hours")
    if max_age is not None:
        age = dt.datetime.now(dt.timezone.utc) - performed_at
        if age > dt.timedelta(hours=float(max_age)):
            raise ContractError("external evidence is stale")
    environment = result.get("environment")
    environment_policy = require_object(request.get("environment_policy"), "environment_policy")
    if isinstance(environment, dict):
        destination = str(environment.get("destination", "")).lower()
        forbidden = {str(item).lower() for item in environment_policy.get("forbidden_destinations", [])}
        allowed = {str(item).lower() for item in environment_policy.get("allowed_destinations", [])}
        if destination in forbidden or (allowed and destination not in allowed):
            raise ContractError(f"evidence destination is not allowed: {destination}")
    elif not isinstance(environment, str) or not environment.strip():
        raise ContractError("environment is required")

    request_items = _items(request.get("evidence_items"), "request evidence_items")
    result_items = _items(result.get("evidence_items"), "result evidence_items")
    required_ids = {item.get("id") for item in request_items if item.get("required") is True}
    result_by_id = {item.get("id"): item for item in result_items}
    missing = sorted(item for item in required_ids if item not in result_by_id)
    if missing:
        raise ContractError(f"required external evidence missing: {', '.join(missing)}")
    normalized_items = []
    for item in result_items:
        refs = _items(item.get("references"), f"references for {item.get('id')}")
        if not refs:
            raise ContractError(f"evidence item has no references: {item.get('id')}")
        normalized_items.append({"id": item.get("id"), "references": [_validate_reference(root, request, reference) for reference in refs]})

    required_postconditions = {item.get("id") for item in _items(request.get("postconditions"), "request postconditions") if item.get("required") is not False}
    postcondition_results = _items(result.get("postcondition_results"), "postcondition_results")
    post_by_id = {item.get("id"): item for item in postcondition_results}
    failures = [item for item in sorted(required_postconditions) if post_by_id.get(item, {}).get("status") != "PASS"]
    if failures:
        raise ContractError(f"required postconditions are not PASS: {', '.join(failures)}")

    return {
        "status": "PASS",
        "evidence_id": f"EV-EXTERNAL-{story_id}-{request['run_id']}-{request['iteration']}-{request['generation']}",
        "kind": "EXTERNAL_EVIDENCE_IMPORTED",
        "request_id": request["request_id"],
        "request_fingerprint": request["fingerprint"],
        "result_fingerprint": result["result_fingerprint"],
        "story_id": story_id,
        "run_id": request["run_id"],
        "iteration": request["iteration"],
        "generation": request["generation"],
        "performed_by": result["performed_by"],
        "performed_at": result["performed_at"],
        "environment": environment,
        "evidence_items": normalized_items,
        "postcondition_results": [{"id": item["id"], "status": item["status"]} for item in postcondition_results],
        "redaction_declaration": redaction,
        "imported_at": now_utc(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--result", required=True, type=Path)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--ledger", type=Path)
    args = parser.parse_args()
    try:
        ledger = args.ledger.resolve() if args.ledger else root_runtime(args.project_root.resolve()) / "evidence-ledger.jsonl"
        event = validate(args.project_root.resolve(), args.request.resolve(), require_object(load_json(args.request), "external evidence request"), require_object(load_json(args.result), "external evidence result"), ledger)
        append_jsonl(ledger, {**event, "producer": "import_external_evidence", "gate": "VALIDATING_EVIDENCE", "artifact_ref": args.result.resolve().relative_to(args.project_root.resolve()).as_posix()})
        print(json.dumps(event, ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
