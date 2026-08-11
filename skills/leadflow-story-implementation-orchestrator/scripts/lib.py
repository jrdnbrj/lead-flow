#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Stdlib-only enforcement primitives for the implementation orchestrator."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

WORKFLOW = "leadflow-story-implementation-orchestrator"
RUNTIME_REL = Path("_bmad-output/orchestration/leadflow-story-implementation")
EXECUTION_TYPES = {"IMPLEMENTATION", "OPERATIONAL", "HYBRID"}
WORKFLOW_MODES = {"FAST", "STRICT"}
REQUIRED_FROZEN_KINDS = {"story_execution_type", "validation_plan", "scope_manifest"}
FROZEN_KIND_ALIASES = {
    "execution-type": "story_execution_type",
    "story_execution_type": "story_execution_type",
    "validation-plan": "validation_plan",
    "validation_plan": "validation_plan",
    "scope-manifest": "scope_manifest",
    "scope_manifest": "scope_manifest",
}
PATH_CATEGORIES = {
    "DEV_WRITABLE",
    "FIXER_WRITABLE",
    "CONTROLLER_ONLY",
    "READ_ONLY_CONTEXT",
    "NORMATIVE_FORBIDDEN",
    "SECRET_FORBIDDEN",
}
STATES = {
    "PENDING",
    "HANDOFF_VERIFYING",
    "RECONCILIATION_REQUIRED",
    "READY_FOR_IMPLEMENTATION",
    "SCOPE_LOCKED",
    "IMPLEMENTING",
    "VALIDATING",
    "AWAITING_EXTERNAL_EVIDENCE",
    "VALIDATING_EVIDENCE",
    "REVIEWING",
    "AWAITING_EXTERNAL_REVIEW",
    "NEEDS_TECHNICAL_FIX",
    "REVALIDATING",
    "CANDIDATE_DONE",
    "DONE",
    "NEEDS_USER_DECISION",
    "ESCALATED",
}
TERMINAL_STORY_STATES = {"DONE", "NEEDS_USER_DECISION", "ESCALATED"}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
STORY_RE = re.compile(r"^E[0-9]+-S[0-9]+[a-z]?$", re.I)
STATUS_RE = re.compile(r"^(?P<prefix>[ \t]*Status:)[ \t]*(?P<value>[^ \t\r\n]+)(?P<trail>[ \t]*)$", re.I | re.M)
STORY_HEADING_RE = re.compile(r"^\s*#\s*(?:Story\s+)?(?:(?P<canonical>E\d+-S\d+[a-z]?)|(?P<numeric>\d+\.\d+[a-z]?))(?:\s*[:\-]|\s|$)", re.I | re.M)
SECRET_KEY_RE = re.compile(r"(?:api[_-]?key|access[_-]?token|password|credential|authorization|private[_-]?key|service[_-]?role|cookie|webhook[_-]?token|secret)", re.I)
SECRET_VALUE_RE = re.compile(r"(?:-----BEGIN|Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{12,})")
RISK_RE = re.compile(r"(?:risk|riesgo)(?:\s+level)?\s*[:=]\s*(LOW|MEDIUM|HIGH|OPERATIONAL)\b", re.I)
STRICT_TEXT_MARKERS = (
    "migration", "migrations", "migración", "migraciones", "auth", "rls", "grant",
    "ownership", "user_id", "tenant_id", "secret", "credential", "password",
    "supabase", "webhook", "remote", "production", "destructive", "private data",
    "datos privados", "backup", "restore", "backfill", "cutover", "external evidence",
    "evidencia externa", "evolution api", "evolution_api",
)


class ContractError(ValueError):
    """A persisted contract or policy is invalid."""


def classify_workflow_mode(
    *,
    story_text: str,
    execution_type: str,
    scope_paths: Iterable[str] | None = None,
    external_evidence_required: bool = False,
) -> dict[str, Any]:
    """Classify FAST/STRICT from observable story/run inputs.

    Unknown risk is intentionally fail-closed to STRICT. This is routing only;
    it does not change the frozen execution type or add a human checkpoint.
    """
    normalized_type = str(execution_type).upper()
    if normalized_type not in EXECUTION_TYPES:
        raise ContractError(f"invalid execution_type for workflow routing: {execution_type}")
    text = story_text.lower()
    reasons: list[str] = []
    risk_match = RISK_RE.search(story_text)
    risk = risk_match.group(1).upper() if risk_match else None
    if risk in {"HIGH", "OPERATIONAL"}:
        reasons.append(f"risk={risk}")
    elif risk is None:
        reasons.append("risk_not_explicit")
    if normalized_type in {"OPERATIONAL", "HYBRID"}:
        reasons.append(f"execution_type={normalized_type}")
    if external_evidence_required:
        reasons.append("external_evidence_required")
    for marker in STRICT_TEXT_MARKERS:
        if marker in text:
            reasons.append(f"story_marker={marker}")
    for path in scope_paths or ():
        path_text = str(path).lower()
        if any(marker in path_text for marker in ("migration", "auth", "rls", "grant", "secret", "ownership", "supabase")):
            reasons.append(f"scope_marker={path}")
    mode = "STRICT" if reasons else "FAST"
    return {"workflow_mode": mode, "reasons": sorted(set(reasons)), "risk": risk}


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_timestamp(value: Any) -> dt.datetime:
    if not isinstance(value, str) or not value:
        raise ContractError("timestamp must be an ISO-8601 string")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError(f"invalid timestamp: {value}") from exc
    if parsed.tzinfo is None:
        raise ContractError("timestamp must include timezone")
    return parsed.astimezone(dt.timezone.utc)


def load_json(path: Path) -> Any:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ContractError(f"missing artifact: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ContractError(f"invalid JSON in {path}: {exc}") from exc
    return value


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def write_bytes_atomic(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def append_jsonl(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(encoded)


def frozen_fingerprint(value: dict[str, Any]) -> str:
    payload = dict(value)
    payload.pop("fingerprint", None)
    return canonical_hash(payload)


def result_fingerprint(value: dict[str, Any]) -> str:
    payload = json.loads(json.dumps(value))
    provenance = payload.get("provenance")
    if isinstance(provenance, dict):
        provenance.pop("result_fingerprint", None)
    payload.pop("result_fingerprint", None)
    return canonical_hash(payload)


def artifact_kind(value: str) -> str:
    try:
        return FROZEN_KIND_ALIASES[value]
    except KeyError as exc:
        raise ContractError(f"unsupported frozen artifact kind: {value}") from exc


def build_provenance(
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
    frozen_artifacts: dict[str, Any],
    evidence_ledger: str,
    evidence_refs: list[str],
    producer: str,
    gate: str,
    result_artifact_ref: str,
) -> dict[str, Any]:
    return {
        "story_id": require_story_id(story_id),
        "run_id": require_string(run_id, "run_id"),
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
        "frozen_artifacts": frozen_artifacts,
        "evidence_ledger": evidence_ledger,
        "evidence_refs": evidence_refs,
        "producer": require_string(producer, "producer"),
        "gate": require_string(gate, "gate"),
        "result_artifact_ref": result_artifact_ref,
    }


def attach_provenance(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    result = dict(payload)
    provenance = build_provenance(**kwargs)
    result["provenance"] = provenance
    provenance["result_fingerprint"] = result_fingerprint(result)
    return result


def verify_fingerprint(value: dict[str, Any]) -> None:
    expected = value.get("fingerprint")
    if not isinstance(expected, str) or not SHA256_RE.fullmatch(expected):
        raise ContractError("missing or invalid embedded fingerprint")
    if frozen_fingerprint(value) != expected:
        raise ContractError("embedded fingerprint does not match artifact content")


def verify_result_fingerprint(value: dict[str, Any]) -> None:
    provenance = value.get("provenance")
    if not isinstance(provenance, dict):
        raise ContractError("result provenance is missing")
    expected = provenance.get("result_fingerprint")
    if not isinstance(expected, str) or not SHA256_RE.fullmatch(expected):
        raise ContractError("result provenance fingerprint is missing or invalid")
    if result_fingerprint(value) != expected:
        raise ContractError("result provenance fingerprint does not match content")


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    return value


def require_string(value: Any, label: str) -> str:
    if isinstance(value, Path):
        value = value.as_posix()
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{label} must be a non-empty string")
    return value


def require_story_id(value: Any, label: str = "story_id") -> str:
    result = require_string(value, label).upper()
    if not STORY_RE.fullmatch(result):
        raise ContractError(f"invalid {label}: {result}")
    return result


def root_runtime(root: Path) -> Path:
    return (root / RUNTIME_REL).resolve()


def canonical_relative(root: Path, raw: Any, *, allow_new: bool = True) -> tuple[Path, str]:
    """Resolve a relative project path and reject traversal and symlink escape."""
    value = require_string(raw, "path")
    if "\x00" in value:
        raise ContractError("path contains a null byte")
    if Path(value).is_absolute() or PurePosixPath(value.replace("\\", "/")).is_absolute():
        raise ContractError(f"absolute paths are forbidden: {value}")
    parts = PurePosixPath(value.replace("\\", "/")).parts
    if ".." in parts:
        raise ContractError(f"path traversal is forbidden: {value}")
    root_resolved = root.resolve()
    candidate = (root_resolved / Path(*parts)).resolve(strict=False)
    try:
        relative = candidate.relative_to(root_resolved).as_posix()
    except ValueError as exc:
        raise ContractError(f"path escapes project root: {value}") from exc
    if not relative or relative == ".":
        raise ContractError("project root itself is not a valid manifest path")
    if not allow_new and not candidate.exists():
        raise ContractError(f"path does not exist: {relative}")
    return candidate, relative


def validate_source_refs(root: Path, refs: Any) -> list[str]:
    if refs is None:
        return []
    if not isinstance(refs, list):
        raise ContractError("source_refs must be an array")
    normalized: list[str] = []
    for ref in refs:
        _, relative = canonical_relative(root, ref, allow_new=False)
        normalized.append(relative)
    return sorted(set(normalized))


def extract_bmad_status(content: str) -> str:
    matches = list(STATUS_RE.finditer(content))
    if len(matches) != 1:
        raise ContractError(f"expected exactly one Status field; found {len(matches)}")
    return matches[0].group("value")


def extract_story_id(content: str) -> str:
    matches = list(STORY_HEADING_RE.finditer(content))
    if len(matches) != 1:
        raise ContractError(f"expected exactly one story heading; found {len(matches)}")
    canonical = matches[0].group("canonical")
    if canonical:
        return require_story_id(canonical)
    numeric = matches[0].group("numeric")
    if not numeric:
        raise ContractError("story heading does not contain a story id")
    epic, story = numeric.split(".", 1)
    return require_story_id(f"E{epic}-S{story}")


def project_bmad_status(content: str, new_status: str) -> tuple[str, str]:
    matches = list(STATUS_RE.finditer(content))
    if len(matches) != 1:
        raise ContractError(f"expected exactly one Status field; found {len(matches)}")
    match = matches[0]
    replacement = f"{match.group('prefix')} {new_status}{match.group('trail')}"
    return content[: match.start()] + replacement + content[match.end() :], match.group("value")


def secret_hits(value: Any, path: tuple[str, ...] = ()) -> list[str]:
    """Find likely secret-bearing fields without retaining their values."""
    hits: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key)
            if key_text in {"sensitive_fields_prohibited", "orchestrator_forbidden_operations", "redaction_declaration"}:
                continue
            if SECRET_KEY_RE.search(key_text) and child not in (None, "", [], {}):
                hits.append(".".join((*path, key_text)))
                continue
            hits.extend(secret_hits(child, (*path, key_text)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            hits.extend(secret_hits(child, (*path, str(index))))
    elif isinstance(value, str) and SECRET_VALUE_RE.search(value):
        hits.append(".".join(path) or "<value>")
    return hits


def _registry_relative(root: Path, path: Path) -> str:
    try:
        relative = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("artifact is outside project root") from exc
    _, normalized = canonical_relative(root, relative, allow_new=False)
    return normalized


def load_frozen_registry(root: Path) -> dict[str, Any]:
    registry_path = root_runtime(root) / "frozen-artifacts.json"
    registry = load_json(registry_path)
    if not isinstance(registry, dict) or not isinstance(registry.get("artifacts"), dict):
        raise ContractError("invalid frozen-artifacts registry")
    return registry


def validate_registered_frozen_artifact(
    root: Path,
    artifact_path: Path,
    *,
    expected_kind: str,
    expected_story_id: str,
    expected_run_id: str,
    expected_iteration: int,
    expected_generation: int,
    expected_input_fingerprint: str,
    expected_story_fingerprint: str,
) -> dict[str, Any]:
    relative = _registry_relative(root, artifact_path)
    registry = load_frozen_registry(root)
    entry = registry["artifacts"].get(relative)
    if not isinstance(entry, dict):
        raise ContractError(f"artifact is not registered as frozen: {relative}")
    kind = artifact_kind(str(entry.get("kind")))
    if kind != artifact_kind(expected_kind):
        raise ContractError(f"frozen artifact kind mismatch: {relative}")
    if entry.get("story_id") != expected_story_id or entry.get("run_id") != expected_run_id:
        raise ContractError(f"frozen artifact story/run mismatch: {relative}")
    if entry.get("iteration") != expected_iteration or entry.get("generation") != expected_generation:
        raise ContractError(f"frozen artifact iteration/generation mismatch: {relative}")
    if entry.get("input_fingerprint") != expected_input_fingerprint or entry.get("story_fingerprint") != expected_story_fingerprint:
        raise ContractError(f"frozen artifact input/story fingerprint mismatch: {relative}")
    if entry.get("file_sha256") != sha256_file(artifact_path):
        raise ContractError(f"frozen artifact changed after freeze: {relative}")
    artifact = load_json(artifact_path)
    verify_fingerprint(artifact)
    if artifact.get("story_id") != expected_story_id or artifact.get("run_id") != expected_run_id:
        raise ContractError(f"frozen artifact embedded story/run mismatch: {relative}")
    if artifact.get("iteration") != expected_iteration or artifact.get("generation") != expected_generation:
        raise ContractError(f"frozen artifact embedded iteration/generation mismatch: {relative}")
    if artifact.get("input_fingerprint") != expected_input_fingerprint or artifact.get("story_fingerprint") != expected_story_fingerprint:
        raise ContractError(f"frozen artifact embedded fingerprint context mismatch: {relative}")
    if kind == "scope_manifest":
        _validate_scope_execution_compatibility(
            root,
            registry,
            artifact,
            story_id=expected_story_id,
            run_id=expected_run_id,
            iteration=expected_iteration,
            generation=expected_generation,
        )
    return {
        "kind": kind,
        "path": relative,
        "file_sha256": entry["file_sha256"],
        "fingerprint": artifact["fingerprint"],
        "story_id": expected_story_id,
        "run_id": expected_run_id,
        "iteration": expected_iteration,
        "generation": expected_generation,
        "input_fingerprint": expected_input_fingerprint,
        "story_fingerprint": expected_story_fingerprint,
    }


def _validate_scope_execution_compatibility(
    root: Path,
    registry: dict[str, Any],
    manifest: dict[str, Any],
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
) -> None:
    """An OPERATIONAL run may never pre-authorize DEV/FIXER writes."""
    execution_pair = next(((relative, entry) for relative, entry in registry.get("artifacts", {}).items() if isinstance(entry, dict)
                           and artifact_kind(str(entry.get("kind"))) == "story_execution_type"
                           and entry.get("story_id") == story_id and entry.get("run_id") == run_id
                           and entry.get("iteration") == iteration and entry.get("generation") == generation), None)
    # Scope-gate unit fixtures may intentionally exercise a manifest before an
    # execution artifact exists. A real frozen run always has one and is checked
    # by validate_required_frozen_artifacts before DONE.
    if execution_pair is None:
        return
    execution_relative, execution_entry = execution_pair
    execution_path = root / execution_relative
    execution = load_json(execution_path)
    verify_fingerprint(execution)
    if execution.get("execution_type") != "OPERATIONAL":
        return
    entries = list(manifest.get("path_classification", [])) + list(manifest.get("path_prefixes_allowed", []))
    if any(isinstance(item, dict) and item.get("category") in {"DEV_WRITABLE", "FIXER_WRITABLE"} for item in entries):
        raise ContractError("OPERATIONAL scope cannot authorize DEV/FIXER paths")


def validate_required_frozen_artifacts(
    root: Path,
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
) -> dict[str, Any]:
    registry = load_frozen_registry(root)
    found: dict[str, Any] = {}
    for relative, entry in registry["artifacts"].items():
        if not isinstance(entry, dict):
            continue
        try:
            kind = artifact_kind(str(entry.get("kind")))
        except ContractError:
            continue
        if kind not in REQUIRED_FROZEN_KINDS:
            continue
        if entry.get("story_id") == story_id and entry.get("run_id") == run_id and entry.get("iteration") == iteration and entry.get("generation") == generation:
            found[kind] = validate_registered_frozen_artifact(
                root,
                root / relative,
                expected_kind=kind,
                expected_story_id=story_id,
                expected_run_id=run_id,
                expected_iteration=iteration,
                expected_generation=generation,
                expected_input_fingerprint=input_fingerprint,
                expected_story_fingerprint=story_fingerprint,
            )
    missing = sorted(REQUIRED_FROZEN_KINDS - set(found))
    if missing:
        raise ContractError(f"required frozen artifacts missing or unregistered: {', '.join(missing)}")
    return found


def validate_artifact_registry(root: Path, artifact_paths: Iterable[Path]) -> None:
    """Compatibility helper; strict callers should use validate_registered_frozen_artifact."""
    registry = load_frozen_registry(root)
    for artifact_path in artifact_paths:
        relative = _registry_relative(root, artifact_path)
        entry = registry["artifacts"].get(relative)
        if not isinstance(entry, dict) or entry.get("file_sha256") != sha256_file(artifact_path):
            raise ContractError(f"artifact is not registered or changed: {relative}")
        verify_fingerprint(load_json(artifact_path))


def _latest(paths: list[Path]) -> Path | None:
    if not paths:
        return None
    return sorted(paths, key=lambda path: (path.stat().st_mtime_ns, path.as_posix()))[-1]


def discover_protected_paths(root: Path, story_id: str) -> list[dict[str, Any]]:
    """Resolve real project paths that DEV/fixer must never receive as writable."""
    root = root.resolve()
    found: dict[str, dict[str, Any]] = {}

    def add(path: Path, category: str, justification: str, source: str, *, allow_missing: bool = False) -> None:
        try:
            resolved, relative = canonical_relative(root, path.relative_to(root), allow_new=allow_missing)
        except (ValueError, ContractError):
            return
        if not allow_missing and not resolved.exists():
            return
        current = found.get(relative)
        if current and current["category"] != category:
            raise ContractError(f"discovered path has conflicting categories: {relative}")
        found[relative] = {
            "path": relative,
            "category": category,
            "justification": justification,
            "exists": resolved.exists(),
            "source": source,
        }

    planning = root / "_bmad-output" / "planning-artifacts"
    prd = _latest(list(planning.glob("prds/**/prd.md")))
    architecture = _latest(list(planning.glob("architecture/**/ARCHITECTURE-SPINE.md")))
    design = _latest(list(planning.glob("ux-designs/**/DESIGN.md")))
    experience = _latest(list(planning.glob("ux-designs/**/EXPERIENCE.md")))
    epics = planning / "epics.md"
    for path, label in ((prd, "current PRD"), (architecture, "current Architecture Spine"), (design, "current UX design"), (experience, "current UX experience"), (epics, "current epics")):
        if path:
            add(path, "NORMATIVE_FORBIDDEN", f"{label} is normative input", label)

    story_dir = root / "_bmad-output" / "implementation-artifacts"
    for story_path in sorted(story_dir.glob("*.md")):
        story_match = re.match(r"^(\d+)-(\d+)([a-z]?)-", story_path.name, re.I)
        current_id = f"E{int(story_match.group(1))}-S{int(story_match.group(2))}{story_match.group(3).lower()}" if story_match else None
        if current_id == story_id:
            continue
        add(story_path, "NORMATIVE_FORBIDDEN", "other story is outside the active scope", "other-story")

    readiness = root / "_bmad-output" / "orchestration" / "leadflow-story-readiness"
    add(readiness, "NORMATIVE_FORBIDDEN", "readiness runtime is an immutable handoff authority", "readiness-runtime", allow_missing=True)

    for path, label in (
        (root / "_bmad-output" / "project-context.md", "project context"),
        (root / "README.md", "repository README"),
        (root / "package.json", "package contract"),
        (root / "docker-compose.yml", "compose contract"),
        (root / "supabase" / "config.toml", "Supabase local config"),
    ):
        add(path, "READ_ONLY_CONTEXT", f"{label} is read-only context", label)

    for path in sorted(root.glob(".env*")):
        add(path, "SECRET_FORBIDDEN", "environment files are forbidden to DEV/fixer", "environment")
    add(root / ".next" / "standalone" / ".env", "SECRET_FORBIDDEN", "generated environment file may contain secrets", "environment")
    add(root / ".git", "CONTROLLER_ONLY", "Git metadata is controller-owned", "git-metadata", allow_missing=True)

    return [found[key] for key in sorted(found)]


def iter_workspace_files(root: Path) -> Iterable[tuple[str, Path]]:
    root = root.resolve()
    ignored = {".git", ".next", "node_modules", "__pycache__"}
    ignored_files = {"tsconfig.tsbuildinfo"}
    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        current_relative = current_path.relative_to(root).as_posix()
        if current_relative == RUNTIME_REL.as_posix() or current_relative.startswith(RUNTIME_REL.as_posix() + "/"):
            dirs[:] = []
            continue
        dirs[:] = sorted([name for name in dirs if name not in ignored])
        for name in sorted(files):
            if name in ignored_files:
                continue
            path = current_path / name
            if path.is_symlink():
                raise ContractError(f"symlink path is not allowed in workspace snapshot: {path.relative_to(root).as_posix()}")
            resolved, relative = canonical_relative(root, path.relative_to(root), allow_new=False)
            yield relative, resolved


def snapshot_workspace(root: Path) -> dict[str, str]:
    return {relative: sha256_file(path) for relative, path in iter_workspace_files(root)}


def workspace_fingerprint(root: Path) -> str:
    return canonical_hash(snapshot_workspace(root))


def validate_result_provenance(
    root: Path,
    result: dict[str, Any],
    result_path: Path,
    *,
    expected_story_id: str,
    expected_run_id: str,
    expected_iteration: int,
    expected_generation: int,
    expected_input_fingerprint: str,
    expected_story_fingerprint: str,
    expected_producer: str,
    expected_gate: str,
    expected_frozen_artifacts: dict[str, Any],
    ledger_path: Path,
    expected_status: str = "PASS",
) -> dict[str, Any]:
    provenance = result.get("provenance")
    if not isinstance(provenance, dict):
        raise ContractError("result is missing provenance")
    if result.get("status") != expected_status:
        raise ContractError(f"result consumed by DONE_GATE must be {expected_status}")
    expected = {
        "story_id": expected_story_id,
        "run_id": expected_run_id,
        "iteration": expected_iteration,
        "generation": expected_generation,
        "input_fingerprint": expected_input_fingerprint,
        "story_fingerprint": expected_story_fingerprint,
        "producer": expected_producer,
        "gate": expected_gate,
    }
    for key, value in expected.items():
        if provenance.get(key) != value:
            raise ContractError(f"result provenance mismatch for {key}")
    result_relative = _registry_relative(root, result_path)
    ledger_relative = _registry_relative(root, ledger_path)
    if provenance.get("evidence_ledger") != ledger_relative:
        raise ContractError("result evidence ledger reference mismatch")
    if provenance.get("result_artifact_ref") != result_relative:
        raise ContractError("result artifact reference mismatch")
    if provenance.get("frozen_artifacts") != expected_frozen_artifacts:
        raise ContractError("result frozen artifact provenance mismatch")
    refs = provenance.get("evidence_refs")
    if not isinstance(refs, list) or not refs or not all(isinstance(ref, str) and ref for ref in refs):
        raise ContractError("result evidence_refs are required")
    verify_result_fingerprint(result)
    if expected_producer == "independent_reviewer" and expected_gate == "REVIEWING":
        _validate_review_type(root, result, expected_frozen_artifacts)
    ledger_entries = read_jsonl(ledger_path)
    by_id = {entry.get("evidence_id"): entry for entry in ledger_entries}
    for ref in refs:
        entry = by_id.get(ref)
        if not isinstance(entry, dict):
            raise ContractError(f"result evidence is not registered: {ref}")
        required_entry = {
            "story_id": expected_story_id,
            "run_id": expected_run_id,
            "iteration": expected_iteration,
            "generation": expected_generation,
            "input_fingerprint": expected_input_fingerprint,
            "story_fingerprint": expected_story_fingerprint,
            "producer": expected_producer,
            "gate": expected_gate,
            "artifact_ref": result_relative,
            "result_fingerprint": provenance["result_fingerprint"],
            "status": expected_status,
        }
        for key, value in required_entry.items():
            if entry.get(key) != value:
                raise ContractError(f"evidence ledger provenance mismatch for {key}: {ref}")
        if entry.get("frozen_artifacts") != expected_frozen_artifacts:
            raise ContractError(f"evidence ledger frozen artifact mismatch: {ref}")
    return provenance


def _validate_review_type(root: Path, result: dict[str, Any], frozen: dict[str, Any]) -> None:
    execution_ref = frozen.get("story_execution_type")
    if not isinstance(execution_ref, dict):
        raise ContractError("review is missing the frozen execution type")
    execution = load_json(root / require_string(execution_ref.get("path"), "execution artifact path"))
    verify_fingerprint(execution)
    execution_type = execution.get("execution_type")
    review_type = result.get("review_type")
    components = result.get("review_components")
    independence = result.get("reviewer_runtime_independence")
    if independence not in {"context_isolated_same_runtime", "separate_reviewer_runtime"}:
        raise ContractError("reviewer runtime independence declaration is missing or invalid")
    if execution_type == "IMPLEMENTATION":
        if review_type != "CODE_REVIEW":
            raise ContractError("IMPLEMENTATION requires CODE_REVIEW")
        return
    if execution_type == "OPERATIONAL":
        if review_type != "OPERATIONAL_EVIDENCE_REVIEW":
            raise ContractError("OPERATIONAL requires OPERATIONAL_EVIDENCE_REVIEW")
        return
    if execution_type == "HYBRID":
        if review_type != "HYBRID_REVIEW" or not isinstance(components, list) or set(components) != {"CODE_REVIEW", "OPERATIONAL_EVIDENCE_REVIEW"}:
            raise ContractError("HYBRID requires CODE_REVIEW and OPERATIONAL_EVIDENCE_REVIEW")
        return
    raise ContractError("review has an unknown frozen execution type")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise ContractError(f"missing evidence ledger: {path}")
    entries: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ContractError(f"invalid evidence ledger JSON at line {line_number}") from exc
        if not isinstance(value, dict):
            raise ContractError(f"evidence ledger entry {line_number} must be an object")
        entries.append(value)
    return entries


def ensure_story_in_state(state: dict[str, Any], story_id: str) -> dict[str, Any]:
    for story in state.get("stories", []):
        if story.get("story_id") == story_id:
            return story
    raise ContractError(f"story is not registered in implementation state: {story_id}")


def validate_state_shape(state: dict[str, Any]) -> None:
    if state.get("schema_version") != "1.0" or state.get("workflow") != WORKFLOW:
        raise ContractError("invalid implementation runtime state identity")
    if state.get("runtime_status") not in {"IDLE", "RUNNING", "BLOCKED"}:
        raise ContractError("invalid runtime_status")
    if not isinstance(state.get("stories"), list):
        raise ContractError("state stories must be an array")
    for story in state["stories"]:
        require_story_id(story.get("story_id"))
        if story.get("status") not in STATES:
            raise ContractError(f"invalid story state: {story.get('status')}")
        require_string(story.get("story_file"), "story_file")


def result(status: str, **fields: Any) -> dict[str, Any]:
    return {"status": status, **fields}
