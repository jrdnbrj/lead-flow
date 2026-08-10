#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///
"""Shared deterministic helpers for the LeadFlow readiness orchestrator."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable


WORKFLOW = "leadflow-story-readiness-orchestrator"
STATES = {
    "PENDING",
    "VALIDATING",
    "NEEDS_TECHNICAL_FIX",
    "NEEDS_USER_DECISION",
    "REVALIDATING",
    "NEEDS_REVALIDATION",
    "READY_FOR_DEV",
    "ESCALATED",
}
GATES = {
    "MANUAL_BASELINE_IMPORT",
    "SELECT_STORY",
    "VALIDATE",
    "TRIAGE",
    "AUTO_FIX",
    "REVALIDATING",
    "FULL_STORY_AUDIT",
    "FINAL_REVALIDATION",
    "MARK_READY_FOR_DEV",
    "STOP_AND_ASK_USER",
    "ESCALATE",
}
DECISION_CATEGORIES = {
    "TECHNICAL_DETERMINISTIC",
    "PRODUCT_DECISION",
    "ARCHITECTURAL_CONTRADICTION",
    "HIGH_RISK_ACCEPTANCE",
    "REVIEW_OVERRIDE",
}
STORY_ID_RE = re.compile(r"^E(?P<epic>\d+)-S(?P<number>\d+)(?P<suffix>[a-z]?)$")
FILENAME_RE = re.compile(r"^(?P<epic>\d+)-(?P<number>\d+)(?P<suffix>[a-z]?)-.+\.md$", re.I)
DEPENDENCY_RE = re.compile(r"\bE(?P<epic>\d+)-S(?P<number>\d+)(?P<suffix>[a-z]?)\b", re.I)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
STATUS_FIELD_RE = re.compile(r"^(?P<prefix>[ \t]*Status:)[ \t]*(?P<value>[^ \t\r\n]+)(?P<trail>[ \t]*)$", re.I | re.M)


class ContractError(ValueError):
    """Raised when a persisted artifact violates the runtime contract."""


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_timestamp(value: Any) -> dt.datetime:
    if not isinstance(value, str) or not value:
        raise ContractError("timestamp must be a non-empty ISO-8601 string")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError(f"invalid timestamp: {value}") from exc
    if parsed.tzinfo is None:
        raise ContractError(f"timestamp must include timezone: {value}")
    return parsed.astimezone(dt.timezone.utc)


def default_runtime(root: Path) -> Path:
    return root / "_bmad-output" / "orchestration" / "leadflow-story-readiness"


def resolve_path(root: Path, value: str | Path) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (root / path).resolve()


def relative_path(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def atomic_write_json(path: Path, value: Any) -> None:
    atomic_write_text(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def append_jsonl(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ContractError(f"missing artifact: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ContractError(f"invalid JSON in {path}: {exc}") from exc


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    entries: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ContractError(f"invalid JSONL at {path}:{line_number}: {exc}") from exc
        if not isinstance(value, dict):
            raise ContractError(f"JSONL entry at {path}:{line_number} must be an object")
        entries.append(value)
    return entries


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(payload)


def story_sort_key(story_id: str) -> tuple[int, int, int]:
    match = STORY_ID_RE.fullmatch(story_id)
    if not match:
        raise ContractError(f"invalid story_id: {story_id}")
    suffix = match.group("suffix")
    suffix_rank = ord(suffix) - ord("a") + 1 if suffix else 0
    return int(match.group("epic")), int(match.group("number")), suffix_rank


def normalize_story_id(value: str) -> str:
    value = value.upper().replace("A", "a").replace("B", "b") if value else value
    match = STORY_ID_RE.fullmatch(value)
    if not match:
        raise ContractError(f"invalid story_id: {value}")
    return f"E{int(match.group('epic'))}-S{int(match.group('number'))}{match.group('suffix')}"


def story_id_from_filename(path: Path) -> str | None:
    match = FILENAME_RE.fullmatch(path.name)
    if not match:
        return None
    suffix = match.group("suffix").lower()
    return f"E{int(match.group('epic'))}-S{int(match.group('number'))}{suffix}"


def discover_story_files(root: Path, story_dir: str, epic: str) -> dict[str, Path]:
    directory = resolve_path(root, story_dir)
    if not directory.is_dir():
        raise ContractError(f"story directory does not exist: {relative_path(root, directory)}")
    expected_epic = int(epic.removeprefix("E"))
    found: dict[str, Path] = {}
    for path in sorted(directory.glob("*.md")):
        story_id = story_id_from_filename(path)
        if story_id is None or int(story_id.split("-")[0][1:]) != expected_epic:
            continue
        if story_id in found:
            raise ContractError(f"duplicate story_id {story_id}: {found[story_id]} and {path}")
        found[story_id] = path.resolve()
    if not found:
        raise ContractError(f"no stories found for {epic} in {directory}")
    return found


def extract_legacy_status(path: Path) -> str | None:
    match = re.search(r"^Status:\s*(\S+)\s*$", path.read_text(encoding="utf-8"), re.I | re.M)
    return match.group(1) if match else None


def project_bmad_status(content: str, new_status: str) -> tuple[str, str]:
    """Replace exactly one BMad Status field and return (content, old_status)."""
    matches = list(STATUS_FIELD_RE.finditer(content))
    if len(matches) != 1:
        raise ContractError(f"expected exactly one unambiguous Status field; found {len(matches)}")
    match = matches[0]
    replacement = f"{match.group('prefix')} {new_status}{match.group('trail')}"
    return content[: match.start()] + replacement + content[match.end() :], match.group("value")


def extract_bmad_status(content: str) -> str:
    matches = list(STATUS_FIELD_RE.finditer(content))
    if len(matches) != 1:
        raise ContractError(f"expected exactly one unambiguous Status field; found {len(matches)}")
    return matches[0].group("value")


def extract_dependencies(path: Path) -> list[str]:
    content = path.read_text(encoding="utf-8")
    section = re.search(r"^##\s+Dependencies\s*$([\s\S]*?)(?=^##\s+|\Z)", content, re.I | re.M)
    if not section:
        return []
    values = {normalize_story_id(match.group(0)) for match in DEPENDENCY_RE.finditer(section.group(1))}
    return sorted(values, key=story_sort_key)


def story_id_from_content(content: str) -> str | None:
    match = re.search(r"^#\s+Story\s+(\d+)\.(\d+)([a-z]?)\s*:", content, re.I | re.M)
    if not match:
        return None
    return f"E{int(match.group(1))}-S{int(match.group(2))}{match.group(3).lower()}"


def source_ref_path(root: Path, reference: str) -> Path:
    return resolve_path(root, reference.split("#", 1)[0])


def fingerprint_reference(root: Path, reference: str, kind: str = "source") -> dict[str, str]:
    path = source_ref_path(root, reference)
    if not path.is_file():
        raise ContractError(f"referenced artifact does not exist: {reference}")
    return {
        "kind": kind,
        "path": relative_path(root, path),
        "sha256": sha256_file(path),
    }


def blank_story(root: Path, story_id: str, path: Path, dependencies: list[str]) -> dict[str, Any]:
    return {
        "story_id": story_id,
        "story_file": relative_path(root, path),
        "dependencies": dependencies,
        "source_status_observed": extract_legacy_status(path),
        "status": "PENDING",
        "current_gate": "SELECT_STORY",
        "review_round": 0,
        "repair_round": 0,
        "last_result": None,
        "blockers_open": [],
        "blockers_resolved": [],
        "decision_required": False,
        "pending_decision_ref": None,
        "resolved_decision_id": None,
        "timestamps": {
            "created_at": now_utc(),
            "updated_at": now_utc(),
            "last_gate_at": None,
            "last_pass_at": None,
        },
        "fingerprint": {
            "algorithm": "sha256",
            "value": sha256_file(path),
            "captured_at": now_utc(),
        },
        "authoritative_fingerprints": [],
        "dependency_fingerprints": [],
        "evidence_refs": [],
        "baseline_import": None,
    }


def state_stories(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    values = state.get("stories")
    if not isinstance(values, list):
        raise ContractError("state.stories must be an array")
    result: dict[str, dict[str, Any]] = {}
    for story in values:
        if not isinstance(story, dict) or not isinstance(story.get("story_id"), str):
            raise ContractError("every state story must be an object with story_id")
        if story["story_id"] in result:
            raise ContractError(f"duplicate state story: {story['story_id']}")
        result[story["story_id"]] = story
    return result


def state_schema_contract_errors(state: dict[str, Any]) -> list[str]:
    """Check the persisted object against the checked-in schema contract."""
    schema_path = Path(__file__).resolve().parents[1] / "assets" / "state.schema.json"
    try:
        schema = load_json(schema_path)
    except ContractError as exc:
        return [f"state schema unavailable: {exc}"]
    errors: list[str] = []
    required = set(schema.get("required", []))
    errors.extend(f"state missing schema-required field: {field}" for field in sorted(required - set(state)))
    story_schema = schema.get("$defs", {}).get("story", {})
    story_required = set(story_schema.get("required", []))
    properties = story_schema.get("properties", {})
    status_enum = set(properties.get("status", {}).get("enum", []))
    gate_enum = set(properties.get("current_gate", {}).get("enum", []))
    stories = state.get("stories")
    if not isinstance(stories, list):
        return errors + ["state.stories must be an array"]
    for index, story in enumerate(stories):
        if not isinstance(story, dict):
            errors.append(f"stories[{index}] must be an object")
            continue
        errors.extend(f"stories[{index}] missing schema-required field: {field}" for field in sorted(story_required - set(story)))
        if story.get("status") not in status_enum:
            errors.append(f"stories[{index}].status is outside state.schema.json enum")
        if story.get("current_gate") not in gate_enum:
            errors.append(f"stories[{index}].current_gate is outside state.schema.json enum")
    if status_enum != STATES:
        errors.append("state.schema.json status enum does not match runtime STATES")
    if gate_enum != GATES:
        errors.append("state.schema.json current_gate enum does not match runtime GATES")
    return errors


def validate_state(state: dict[str, Any], root: Path, require_files: bool = True) -> list[str]:
    errors: list[str] = state_schema_contract_errors(state)
    if state.get("schema_version") != "1.0":
        errors.append("schema_version must be 1.0")
    if state.get("workflow") != WORKFLOW:
        errors.append("workflow identifier is invalid")
    if not isinstance(state.get("state_revision"), int) or state["state_revision"] < 0:
        errors.append("state_revision must be a non-negative integer")
    try:
        stories = state_stories(state)
    except ContractError as exc:
        return errors + [str(exc)]
    for story_id, story in stories.items():
        try:
            normalize_story_id(story_id)
        except ContractError as exc:
            errors.append(str(exc))
        if story.get("status") not in STATES:
            errors.append(f"{story_id}: invalid status {story.get('status')!r}")
        if story.get("current_gate") not in GATES:
            errors.append(f"{story_id}: invalid current_gate {story.get('current_gate')!r}")
        for field in ("review_round", "repair_round"):
            value = story.get(field)
            maximum = 2 if field == "review_round" else 3
            if not isinstance(value, int) or not 0 <= value <= maximum:
                errors.append(f"{story_id}: invalid {field}")
        if not isinstance(story.get("dependencies"), list):
            errors.append(f"{story_id}: dependencies must be an array")
        else:
            for dependency in story["dependencies"]:
                if dependency not in stories:
                    errors.append(f"{story_id}: dependency not in state: {dependency}")
        path_value = story.get("story_file")
        if not isinstance(path_value, str):
            errors.append(f"{story_id}: story_file must be a path")
        else:
            path = resolve_path(root, path_value)
            implementation_dir = (root / "_bmad-output" / "implementation-artifacts").resolve()
            if not path.is_relative_to(implementation_dir):
                errors.append(f"{story_id}: story_file escapes implementation-artifacts")
            if require_files and not path.is_file():
                errors.append(f"{story_id}: story_file does not exist: {path_value}")
        if not isinstance(story.get("blockers_open"), list) or not isinstance(story.get("blockers_resolved"), list):
            errors.append(f"{story_id}: blocker fields must be arrays")
        if not isinstance(story.get("decision_required"), bool):
            errors.append(f"{story_id}: decision_required must be boolean")
        if story.get("decision_required") and not story.get("pending_decision_ref"):
            errors.append(f"{story_id}: decision_required requires pending_decision_ref")
        elif story.get("pending_decision_ref") is not None and not isinstance(story.get("pending_decision_ref"), str):
            errors.append(f"{story_id}: pending_decision_ref must be a string or null")
        if not isinstance(story.get("source_status_observed"), (str, type(None))):
            errors.append(f"{story_id}: source_status_observed must be a string or null")
        evidence_refs = story.get("evidence_refs")
        if not isinstance(evidence_refs, list) or any(not isinstance(value, str) for value in evidence_refs):
            errors.append(f"{story_id}: evidence_refs must be an array of strings")
        timestamps = story.get("timestamps")
        if not isinstance(timestamps, dict):
            errors.append(f"{story_id}: timestamps must be an object")
        else:
            for field in ("created_at", "updated_at", "last_gate_at", "last_pass_at"):
                if field not in timestamps:
                    errors.append(f"{story_id}: timestamps.{field} is required")
                    continue
                value = timestamps.get(field)
                if value is not None:
                    try:
                        parse_timestamp(value)
                    except ContractError as exc:
                        errors.append(f"{story_id}: timestamps.{field}: {exc}")
        fingerprint = story.get("fingerprint")
        if (
            not isinstance(fingerprint, dict)
            or fingerprint.get("algorithm") != "sha256"
            or not isinstance(fingerprint.get("value"), str)
            or not SHA256_RE.fullmatch(fingerprint["value"])
            or not isinstance(fingerprint.get("captured_at"), str)
        ):
            errors.append(f"{story_id}: invalid fingerprint")
        elif fingerprint.get("captured_at"):
            try:
                parse_timestamp(fingerprint["captured_at"])
            except ContractError as exc:
                errors.append(f"{story_id}: fingerprint.captured_at: {exc}")
        for collection_name, item_fields in (
            ("authoritative_fingerprints", ("kind", "path", "sha256")),
            ("dependency_fingerprints", ("story_id", "sha256")),
        ):
            collection = story.get(collection_name)
            if not isinstance(collection, list):
                errors.append(f"{story_id}: {collection_name} must be an array")
                continue
            for index, item in enumerate(collection):
                if not isinstance(item, dict) or any(field not in item for field in item_fields):
                    errors.append(f"{story_id}: invalid {collection_name}[{index}]")
                    continue
                if not isinstance(item.get("sha256"), str) or not SHA256_RE.fullmatch(item["sha256"]):
                    errors.append(f"{story_id}: invalid {collection_name}[{index}].sha256")
                if collection_name == "dependency_fingerprints" and item.get("story_id") not in stories:
                    errors.append(f"{story_id}: dependency fingerprint references unknown story {item.get('story_id')}")
        result = story.get("last_result")
        if result is not None:
            if not isinstance(result, dict):
                errors.append(f"{story_id}: last_result must be an object or null")
            else:
                if result.get("gate") not in GATES:
                    errors.append(f"{story_id}: last_result.gate is invalid")
                if result.get("verdict") not in {"PASS", "FAIL", "APPLIED", "ESCALATED", "PENDING"}:
                    errors.append(f"{story_id}: last_result.verdict is invalid")
                if not isinstance(result.get("iteration"), int) or result["iteration"] < 0:
                    errors.append(f"{story_id}: last_result.iteration is invalid")
                if not isinstance(result.get("evidence_refs"), list) or any(not isinstance(value, str) for value in result["evidence_refs"]):
                    errors.append(f"{story_id}: last_result.evidence_refs must be an array of strings")
                try:
                    parse_timestamp(result.get("timestamp"))
                except ContractError as exc:
                    errors.append(f"{story_id}: last_result.timestamp: {exc}")
        validation_fingerprint = story.get("validation_fingerprint")
        if validation_fingerprint is not None and (
            not isinstance(validation_fingerprint, dict)
            or validation_fingerprint.get("algorithm") != "sha256"
            or not isinstance(validation_fingerprint.get("value"), str)
            or not SHA256_RE.fullmatch(validation_fingerprint["value"])
        ):
            errors.append(f"{story_id}: invalid validation_fingerprint")
        elif validation_fingerprint is not None:
            try:
                parse_timestamp(validation_fingerprint.get("captured_at"))
            except ContractError as exc:
                errors.append(f"{story_id}: validation_fingerprint.captured_at: {exc}")
        status_projection = story.get("status_projection")
        if status_projection is not None:
            if not isinstance(status_projection, dict):
                errors.append(f"{story_id}: status_projection must be an object or null")
            else:
                for field in ("validated_hash", "final_hash"):
                    if not isinstance(status_projection.get(field), str) or not SHA256_RE.fullmatch(status_projection[field]):
                        errors.append(f"{story_id}: invalid status_projection.{field}")
                if status_projection.get("field") != "Status" or status_projection.get("to") != "ready-for-dev":
                    errors.append(f"{story_id}: invalid status_projection target")
                try:
                    parse_timestamp(status_projection.get("timestamp"))
                except ContractError as exc:
                    errors.append(f"{story_id}: status_projection.timestamp: {exc}")
        if story.get("status") == "READY_FOR_DEV":
            if not isinstance(result, dict) or result.get("verdict") != "PASS":
                errors.append(f"{story_id}: READY_FOR_DEV requires last_result PASS")
            if not evidence_refs:
                errors.append(f"{story_id}: READY_FOR_DEV requires evidence_refs")
            if story.get("current_gate") not in {"MANUAL_BASELINE_IMPORT", "MARK_READY_FOR_DEV"}:
                errors.append(f"{story_id}: READY_FOR_DEV requires a terminal readiness gate")
    return errors


def require_valid_state(path: Path, root: Path) -> dict[str, Any]:
    state = load_json(path)
    if not isinstance(state, dict):
        raise ContractError("state must be a JSON object")
    errors = validate_state(state, root)
    if errors:
        raise ContractError("invalid state: " + "; ".join(errors))
    return state


def repo_dirty_paths(root: Path) -> set[str] | None:
    git_dir = root / ".git"
    if not git_dir.exists():
        return None
    result = subprocess.run(
        ["git", "-C", str(root), "status", "--porcelain=v1", "--untracked-files=all"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    paths: set[str] = set()
    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        value = line[3:]
        if " -> " in value:
            value = value.split(" -> ", 1)[1]
        paths.add(value)
    return paths


def update_timestamp(story: dict[str, Any]) -> None:
    story.setdefault("timestamps", {})["updated_at"] = now_utc()


def evidence_index(evidence_path: Path) -> dict[str, Any]:
    entries = read_jsonl(evidence_path)
    by_story: dict[str, list[str]] = {}
    for entry in entries:
        story_id = entry.get("story")
        evidence_id = entry.get("evidence_id")
        if isinstance(story_id, str) and isinstance(evidence_id, str):
            by_story.setdefault(story_id, []).append(evidence_id)
    return {"schema_version": "1.0", "entries": len(entries), "by_story": by_story, "rebuilt_at": now_utc()}


def ensure_relative_under(root: Path, path_value: str, allowed: Path) -> Path:
    path = resolve_path(root, path_value)
    allowed = allowed.resolve()
    if not path.is_relative_to(allowed):
        raise ContractError(f"path outside allowlist: {path_value}")
    return path
