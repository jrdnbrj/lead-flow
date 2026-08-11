#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Verify an external review bundle before asking a human reviewer to use it."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from lib import ContractError, canonical_relative, load_json, root_runtime, sha256_file


SHA_RE = re.compile(r"\b[0-9a-f]{64}\b")
STALE_GENERATION_PATTERNS = (
    re.compile(r'"generation"\s*:\s*1\b'),
    re.compile(r"\bgeneration\s*[:=]\s*1\b"),
    re.compile(r"\bgeneration\s+1\b"),
    re.compile(r'-1-1(?=["\'`\s,.)\]}]|$)'),
)


def _relative(root: Path, path: Path, *, allow_new: bool = False) -> str:
    try:
        raw = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("review manifest artifact must be inside project root") from exc
    _, relative = canonical_relative(root, raw, allow_new=allow_new)
    return relative


def _resolve_artifact(root: Path, manifest_path: Path, raw_path: Any) -> tuple[Path, str]:
    if not isinstance(raw_path, str) or not raw_path:
        raise ContractError("review manifest artifact path is required")
    if raw_path.startswith("/") or ".." in Path(raw_path).parts:
        raise ContractError(f"review manifest artifact path is not canonical: {raw_path}")
    candidate = root / raw_path if raw_path.startswith("_bmad-output/") else manifest_path.parent / raw_path
    return candidate, _relative(root, candidate, allow_new=False)


def _artifact_entries(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        raise ContractError("review manifest artifacts must be an array of physical artifact locks")
    entries: list[dict[str, Any]] = []
    for index, entry in enumerate(artifacts):
        if not isinstance(entry, dict):
            raise ContractError(f"review manifest artifact #{index} must be an object")
        path = entry.get("path")
        sha = entry.get("sha256")
        kind = entry.get("kind")
        if not isinstance(path, str) or not path:
            raise ContractError(f"review manifest artifact #{index} has no physical path")
        if not isinstance(sha, str) or not SHA_RE.fullmatch(sha):
            raise ContractError(f"review manifest artifact {path} has invalid sha256")
        if not isinstance(kind, str) or not kind:
            raise ContractError(f"review manifest artifact {path} has no kind")
        entries.append(entry)
    return entries


def _assert_context(value: dict[str, Any], *, story_id: str, run_id: str, iteration: int, generation: int, input_fingerprint: str, story_fingerprint: str, label: str) -> None:
    expected = {
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
    }
    for key, expected_value in expected.items():
        if value.get(key) != expected_value:
            raise ContractError(f"{label} mismatch for {key}")


def _assert_schema(schema: dict[str, Any], *, story_id: str, run_id: str, iteration: int, generation: int, input_fingerprint: str, story_fingerprint: str) -> None:
    expected = {
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
    }
    for key, expected_value in expected.items():
        top = schema.get("properties", {}).get(key, {}).get("const")
        provenance = schema.get("properties", {}).get("provenance", {}).get("properties", {}).get(key, {}).get("const")
        if top != expected_value or provenance != expected_value:
            raise ContractError(f"review result schema mismatch for {key}")


def _collect_hashes(value: Any, output: set[str]) -> None:
    if isinstance(value, str) and SHA_RE.fullmatch(value):
        output.add(value)
    elif isinstance(value, dict):
        for item in value.values():
            _collect_hashes(item, output)
    elif isinstance(value, list):
        for item in value:
            _collect_hashes(item, output)


def _assert_no_stale_text(path: Path, text: str, *, generation: int, allowed_hashes: set[str]) -> None:
    if generation > 1:
        for pattern in STALE_GENERATION_PATTERNS:
            if pattern.search(text):
                raise ContractError(f"review artifact contains stale generation metadata: {path.name}")
    if path.suffix.lower() in {".md", ".txt"}:
        for token in SHA_RE.findall(text):
            if token not in allowed_hashes:
                raise ContractError(f"review artifact contains an unlocked SHA-256 token: {path.name}:{token}")


def verify(
    root: Path,
    manifest_path: Path,
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
) -> dict[str, Any]:
    root = root.resolve()
    runtime = root_runtime(root)
    manifest_path = manifest_path.resolve()
    manifest_ref = _relative(root, manifest_path, allow_new=False)
    if not manifest_ref.startswith(runtime.relative_to(root).as_posix() + "/"):
        raise ContractError("review manifest must be inside the implementation runtime")
    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise ContractError("review manifest must be an object")
    _assert_context(
        manifest,
        story_id=story_id,
        run_id=run_id,
        iteration=iteration,
        generation=generation,
        input_fingerprint=input_fingerprint,
        story_fingerprint=story_fingerprint,
        label="review manifest",
    )
    entries = _artifact_entries(manifest)
    paths_seen: set[str] = set()
    kinds_seen: set[str] = set()
    resolved: list[tuple[dict[str, Any], Path, str]] = []
    allowed_hashes = {input_fingerprint, story_fingerprint}
    for entry in entries:
        path, ref = _resolve_artifact(root, manifest_path, entry["path"])
        if ref in paths_seen:
            raise ContractError(f"review manifest duplicates artifact path: {ref}")
        paths_seen.add(ref)
        kinds_seen.add(entry["kind"])
        if not path.exists() or not path.is_file():
            raise ContractError(f"review manifest artifact is missing: {entry['path']}")
        actual = sha256_file(path)
        if actual != entry["sha256"]:
            raise ContractError(f"review manifest sha256 mismatch for {entry['path']}: expected {entry['sha256']} actual {actual}")
        allowed_hashes.add(entry["sha256"])
        provenance = entry.get("provenance")
        if isinstance(provenance, dict):
            _assert_context(
                provenance,
                story_id=story_id,
                run_id=run_id,
                iteration=iteration,
                generation=generation,
                input_fingerprint=input_fingerprint,
                story_fingerprint=story_fingerprint,
                label=f"review artifact provenance {entry['path']}",
            )
            _collect_hashes(provenance, allowed_hashes)
        resolved.append((entry, path, ref))
    required_kinds = {"review_bundle", "review_result_schema", "implementation_diff", "story_execution_type", "validation_plan", "scope_manifest", "validation_result"}
    missing = sorted(required_kinds - kinds_seen)
    if missing:
        raise ContractError(f"review manifest missing required artifact kinds: {', '.join(missing)}")
    if any(entry["path"] == "complete_implementation_diff" for entry in entries):
        raise ContractError("review manifest contains a logical implementation diff lock without a physical artifact")
    for entry, path, _ref in resolved:
        if entry["kind"] == "review_result_schema":
            schema = load_json(path)
            if not isinstance(schema, dict):
                raise ContractError("review result schema must be an object")
            _assert_schema(schema, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation, input_fingerprint=input_fingerprint, story_fingerprint=story_fingerprint)
        if entry["kind"] in {"review_bundle", "review_prompt", "review_result_schema", "implementation_diff"}:
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            _assert_no_stale_text(path, text, generation=generation, allowed_hashes=allowed_hashes)
    return {
        "status": "PASS",
        "gate": "EXTERNAL_REVIEW_BUNDLE_PREFLIGHT",
        "manifest_ref": manifest_ref,
        "artifact_count": len(entries),
        "verified_kinds": sorted(kinds_seen),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.project_root, args.manifest, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
