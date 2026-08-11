#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""Generate and install one generation-scoped external review contract."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from lib import (
    ContractError,
    append_jsonl,
    canonical_hash,
    canonical_relative,
    ensure_story_in_state,
    load_frozen_registry,
    load_json,
    now_utc,
    root_runtime,
    sha256_file,
    validate_required_frozen_artifacts,
    validate_state_shape,
    write_bytes_atomic,
    write_json_atomic,
)
from verify_external_review_bundle import verify as verify_review_bundle


STALE_GENERATION_PATTERNS = (
    re.compile(r'"generation"\s*:\s*1\b'),
    re.compile(r'\bgeneration\s*[:=]\s*1\b'),
    re.compile(r'\bgeneration\s+1\b'),
    re.compile(r'-1-1(?=["\'`\\s,.)\\]}]|$)'),
)


def _relative(root: Path, path: Path, *, allow_new: bool = False) -> str:
    try:
        raw = path.resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise ContractError("review artifact must be inside project root") from exc
    _, relative = canonical_relative(root, raw, allow_new=allow_new)
    return relative


def _assert_generation_text(value: str, *, label: str, root: Path, story_id: str, run_id: str, iteration: int, generation: int) -> None:
    if generation == 1:
        raise ContractError("review recovery requires a generation greater than 1")
    for pattern in STALE_GENERATION_PATTERNS:
        if pattern.search(value):
            raise ContractError(f"{label} contains stale generation metadata: {pattern.pattern}")
    registry = load_frozen_registry(root)
    stale_tokens: set[str] = set()
    for entry in registry.get("artifacts", {}).values():
        if not isinstance(entry, dict):
            continue
        if entry.get("story_id") != story_id or entry.get("run_id") != run_id or entry.get("iteration") != iteration:
            continue
        entry_generation = entry.get("generation")
        if isinstance(entry_generation, int) and entry_generation != generation:
            for key in ("file_sha256", "fingerprint", "path"):
                token = entry.get(key)
                if isinstance(token, str) and token:
                    stale_tokens.add(token)
    for token in sorted(stale_tokens):
        if token in value:
            raise ContractError(f"{label} contains a frozen artifact token from another generation: {token}")


def _set_const(schema: dict[str, Any], path: tuple[str, ...], value: Any) -> None:
    node: Any = schema
    for part in path:
        if not isinstance(node, dict) or part not in node:
            raise ContractError(f"review schema template missing {'/'.join(path)}")
        node = node[part]
    if not isinstance(node, dict) or "const" not in node:
        raise ContractError(f"review schema template constant missing {'/'.join(path)}")
    node["const"] = value


def _generation_schema(template: dict[str, Any], *, context: dict[str, Any], frozen: dict[str, Any], evidence_ref: str, result_ref: str) -> dict[str, Any]:
    schema = json.loads(json.dumps(template))
    for key in ("story_id", "run_id", "iteration", "generation", "input_fingerprint", "story_fingerprint"):
        _set_const(schema, ("properties", key), context[key])
        _set_const(schema, ("properties", "provenance", "properties", key), context[key])
    _set_const(schema, ("properties", "provenance", "properties", "frozen_artifacts"), frozen)
    _set_const(schema, ("properties", "provenance", "properties", "evidence_ledger"), "_bmad-output/orchestration/leadflow-story-implementation/evidence-ledger.jsonl")
    _set_const(schema, ("properties", "provenance", "properties", "evidence_refs"), [evidence_ref])
    _set_const(schema, ("properties", "provenance", "properties", "result_artifact_ref"), result_ref)
    return schema


def _strip_lock_section(source: str) -> str:
    text = re.sub(
        r"\n## Immutable review lock\n.*?(?=\n## |\Z)",
        "\n",
        source,
        flags=re.S,
    )
    text = re.sub(r'^\s*"workspace_fingerprint_validated":\s*"[0-9a-f]{64}",?\s*$', "", text, flags=re.M)
    text = re.sub(r"^.*(?:content fingerprint|Plan fingerprint|Validation-result provenance fingerprint|Scope-manifest fingerprint):.*[0-9a-f]{64}.*$", "", text, flags=re.M)
    return text.strip()


def _bundle_text(source: str, *, schema_ref: str, manifest_ref: str, context: dict[str, Any], result_ref: str, evidence_ref: str, label: str) -> str:
    text = source.replace("generation-2/review-result.schema.json", schema_ref)
    text = text.replace("# E4-S2 independent code-review bundle — generation 2", f"# E4-S2 independent code-review bundle — generation 2 {label}")
    text = _strip_lock_section(text)
    lock = {
        "bundle_contract": "generation-scoped",
        "manifest_ref": manifest_ref,
        "result_schema_ref": schema_ref,
        "result_artifact_ref": result_ref,
        "evidence_ref": evidence_ref,
        **context,
    }
    return text.rstrip() + "\n\n## External review manifest\n\nThe manifest is the only source of artifact paths and SHA-256 locks. Verify it before reviewing implementation semantics.\n\n```json\n" + json.dumps(lock, ensure_ascii=False, indent=2, sort_keys=True) + "\n```\n"


def _artifact_lock(path: Path, *, root: Path, manifest_dir: Path, kind: str, provenance: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        artifact_path = path.resolve().relative_to(manifest_dir.resolve()).as_posix()
    except ValueError:
        artifact_path = path.resolve().relative_to(root.resolve()).as_posix()
    entry: dict[str, Any] = {
        "path": artifact_path,
        "sha256": sha256_file(path),
        "kind": kind,
    }
    if provenance:
        entry["provenance"] = provenance
    return entry


def _prompt(*, bundle_ref: str, manifest_ref: str, schema_ref: str, result_ref: str, evidence_ref: str, context: dict[str, Any]) -> str:
    return (
        "Act as an independent code reviewer in a separate runtime. Review only the immutable bundle at "
        f"`{bundle_ref}` and first verify `{manifest_ref}`.\n\n"
        "The authoritative review identity is exactly:\n"
        f"- story_id: `{context['story_id']}`\n"
        f"- run_id: `{context['run_id']}`\n"
        f"- iteration: `{context['iteration']}`\n"
        f"- generation: `{context['generation']}`\n"
        f"- input_fingerprint: `{context['input_fingerprint']}`\n"
        f"- story_fingerprint: `{context['story_fingerprint']}`\n\n"
        "Use only the frozen artifact locks in the bundle. Do not copy identity or locks from another run. "
        "If any lock differs, return ESCALATE and do not review the implementation. Do not modify files, "
        "run migrations, connect to Supabase, execute tests, FINAL_SCOPE_GATE or DONE_GATE.\n\n"
        f"Return only one JSON object conforming to `{schema_ref}`. Set reviewer_runtime_independence to "
        "separate_reviewer_runtime. Use the sole evidence ref "
        f"`{evidence_ref}`. Save the result at `{result_ref}`. Compute provenance.result_fingerprint as "
        "SHA-256 of canonical JSON (sorted keys, UTF-8, compact separators) after omitting only "
        "provenance.result_fingerprint."
    )


def prepare(
    root: Path,
    state_path: Path,
    ledger_path: Path,
    *,
    story_id: str,
    run_id: str,
    iteration: int,
    generation: int,
    input_fingerprint: str,
    story_fingerprint: str,
    source_bundle: Path,
    output_dir: Path,
    recovery_label: str,
) -> dict[str, Any]:
    root = root.resolve()
    runtime = root_runtime(root)
    if state_path.resolve() != (runtime / "state.json").resolve():
        raise ContractError("review preparation state path must be the implementation runtime state")
    state = load_json(state_path)
    validate_state_shape(state)
    story = ensure_story_in_state(state, story_id)
    if story.get("status") != "AWAITING_EXTERNAL_REVIEW":
        raise ContractError("review preparation requires AWAITING_EXTERNAL_REVIEW")
    if story.get("run_id") != run_id or story.get("iteration") != iteration or story.get("generation") != generation:
        raise ContractError("review preparation active run context mismatch")
    if story.get("repair_round") is None:
        raise ContractError("review preparation requires an existing repair_round")
    frozen = validate_required_frozen_artifacts(
        root,
        story_id=story_id,
        run_id=run_id,
        iteration=iteration,
        generation=generation,
        input_fingerprint=input_fingerprint,
        story_fingerprint=story_fingerprint,
    )
    source_ref = _relative(root, source_bundle.resolve(), allow_new=False)
    source_text = source_bundle.read_text(encoding="utf-8")
    output_dir = output_dir.resolve()
    output_ref = _relative(root, output_dir, allow_new=True)
    if not output_ref.startswith(runtime.relative_to(root).as_posix() + "/"):
        raise ContractError("review artifacts must be inside the implementation runtime")
    output_dir.mkdir(parents=True, exist_ok=True)
    label = recovery_label.strip().lower()
    if not re.fullmatch(r"recovery-[2-9][0-9]*", label):
        raise ContractError("recovery_label must be recovery-2 or later")
    bundle_path = output_dir / f"review-bundle.{label}.md"
    manifest_path = output_dir / f"review-bundle.{label}.manifest.json"
    prompt_path = output_dir / f"review-prompt.{label}.md"
    schema_path = output_dir / f"review-result.{label}.schema.json"
    diff_path = output_dir / f"complete-implementation-diff.{label}.patch"
    request_path = output_dir / f"external-review-request.{label}.json"
    result_path = output_dir / f"review-result.{label}.json"
    for path in (bundle_path, manifest_path, prompt_path, schema_path, diff_path, request_path, result_path):
        if path.exists():
            raise ContractError(f"review recovery artifact already exists: {_relative(root, path)}")
    context = {
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "input_fingerprint": input_fingerprint,
        "story_fingerprint": story_fingerprint,
    }
    evidence_ref = f"EV-CODE-REVIEW-{story_id}-{run_id}-{iteration}-{generation}"
    schema_ref = _relative(root, schema_path, allow_new=True)
    manifest_ref = _relative(root, manifest_path, allow_new=True)
    bundle_ref = _relative(root, bundle_path, allow_new=True)
    result_ref = _relative(root, result_path, allow_new=True)
    prompt_ref = _relative(root, prompt_path, allow_new=True)
    schema_template = load_json(output_dir / "review-result.schema.json") if (output_dir / "review-result.schema.json").exists() else load_json(root / "skills" / "leadflow-story-implementation-orchestrator" / "assets" / "review-result.schema.json")
    schema = _generation_schema(schema_template, context=context, frozen=frozen, evidence_ref=evidence_ref, result_ref=result_ref)
    bundle = _bundle_text(source_text, schema_ref=schema_ref, manifest_ref=manifest_ref, context=context, result_ref=result_ref, evidence_ref=evidence_ref, label=label)
    prompt = _prompt(bundle_ref=bundle_ref, manifest_ref=manifest_ref, schema_ref=schema_ref, result_ref=result_ref, evidence_ref=evidence_ref, context=context)
    for value, label_name in ((bundle, "review bundle"), (prompt, "review prompt"), (json.dumps(schema, ensure_ascii=False, sort_keys=True), "review schema")):
        _assert_generation_text(value, label=label_name, root=root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation)
    write_bytes_atomic(diff_path, (output_dir / "implementation.diff").read_bytes())
    write_bytes_atomic(bundle_path, bundle.encode("utf-8"))
    write_bytes_atomic(prompt_path, prompt.encode("utf-8"))
    write_json_atomic(schema_path, schema)
    frozen_provenance = {kind: {**entry, "artifact_kind": kind} for kind, entry in frozen.items()}
    manifest_payload: dict[str, Any] = {
        "schema_version": "1.0",
        "bundle_id": f"RB-{story_id}-{run_id}-{iteration}-{generation}-{label}",
        **context,
        "artifacts": [
            _artifact_lock(bundle_path, root=root, manifest_dir=output_dir, kind="review_bundle", provenance=context),
            _artifact_lock(prompt_path, root=root, manifest_dir=output_dir, kind="review_prompt", provenance=context),
            _artifact_lock(schema_path, root=root, manifest_dir=output_dir, kind="review_result_schema", provenance=context),
            _artifact_lock(diff_path, root=root, manifest_dir=output_dir, kind="implementation_diff", provenance=context),
            _artifact_lock(root / frozen["story_execution_type"]["path"], root=root, manifest_dir=output_dir, kind="story_execution_type", provenance=frozen_provenance["story_execution_type"]),
            _artifact_lock(root / frozen["validation_plan"]["path"], root=root, manifest_dir=output_dir, kind="validation_plan", provenance=frozen_provenance["validation_plan"]),
            _artifact_lock(root / frozen["scope_manifest"]["path"], root=root, manifest_dir=output_dir, kind="scope_manifest", provenance=frozen_provenance["scope_manifest"]),
            _artifact_lock(output_dir / "validation-result.json", root=root, manifest_dir=output_dir, kind="validation_result", provenance=context),
        ],
    }
    manifest_payload["bundle_fingerprint"] = canonical_hash(manifest_payload)
    _assert_generation_text(json.dumps(manifest_payload, ensure_ascii=False, sort_keys=True), label="review manifest", root=root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation)
    write_json_atomic(manifest_path, manifest_payload)
    preflight = verify_review_bundle(
        root,
        manifest_path,
        story_id=story_id,
        run_id=run_id,
        iteration=iteration,
        generation=generation,
        input_fingerprint=input_fingerprint,
        story_fingerprint=story_fingerprint,
    )
    request_payload: dict[str, Any] = {
        "schema_version": "1.0",
        "request_id": f"REQ-REVIEW-{story_id}-{run_id}-{iteration}-{generation}-{label}",
        **context,
        "bundle_ref": bundle_ref,
        "bundle_manifest_ref": manifest_ref,
        "schema_ref": schema_ref,
        "expected_result_ref": result_ref,
        "single_request": True,
        "status": "AWAITING_EXTERNAL_REVIEW",
        "created_at": now_utc(),
        "prompt_ref": prompt_ref,
        "prompt": prompt,
        "preflight": preflight,
    }
    request_payload["request_fingerprint"] = canonical_hash(request_payload)
    _assert_generation_text(json.dumps(request_payload, ensure_ascii=False, sort_keys=True), label="review request", root=root, story_id=story_id, run_id=run_id, iteration=iteration, generation=generation)
    write_json_atomic(request_path, request_payload)
    old_request = story.get("external_review_request")
    superseded: list[str] = []
    old_files: list[Path] = []
    if isinstance(old_request, dict):
        for key in ("request_ref", "expected_result_ref"):
            value = old_request.get(key)
            if isinstance(value, str):
                old_path = root / value
                if old_path.exists() and old_path not in old_files:
                    old_files.append(old_path)
    for old_path in old_files:
        archived = old_path.with_name(old_path.name + f".invalid-controller-artifact.{now_utc().replace(':', '').replace('-', '')}")
        write_bytes_atomic(archived, old_path.read_bytes())
        old_path.unlink()
        superseded.append(_relative(root, archived, allow_new=False))
    state_before = state_path.read_bytes()
    ledger_before = ledger_path.read_bytes() if ledger_path.exists() else None
    try:
        story["blockers_open"] = []
        story["external_review_request"] = {
            "request_id": request_payload["request_id"],
            "request_ref": request_path.relative_to(root).as_posix(),
            "bundle_ref": bundle_ref,
            "bundle_manifest_ref": manifest_ref,
            "schema_ref": schema_ref,
            "expected_result_ref": result_ref,
            "story_id": story_id,
            "run_id": run_id,
            "iteration": iteration,
            "generation": generation,
            "input_fingerprint": input_fingerprint,
            "story_fingerprint": story_fingerprint,
            "request_fingerprint": request_payload["request_fingerprint"],
            "status": "AWAITING_EXTERNAL_REVIEW",
        }
        story["last_transition"] = {"from": "AWAITING_EXTERNAL_REVIEW", "to": "AWAITING_EXTERNAL_REVIEW", "reason": "controller-owned review provenance regenerated", "timestamp": request_payload["created_at"]}
        state["revision"] = int(state.get("revision", 0)) + 1
        state["runtime_status"] = "RUNNING"
        state["active_story_id"] = story_id
        write_json_atomic(state_path, state)
        event: dict[str, Any] = {
            "evidence_id": f"EV-EXTERNAL-REVIEW-REQUEST-{story_id}-{run_id}-{iteration}-{generation}-{label}",
            "kind": "EXTERNAL_REVIEW_REQUEST_REGENERATED",
            "status": "REQUESTED",
            **context,
            "producer": "prepare_external_review",
            "gate": "AWAITING_EXTERNAL_REVIEW",
            "artifact_ref": request_path.relative_to(root).as_posix(),
            "request_id": request_payload["request_id"],
            "request_fingerprint": request_payload["request_fingerprint"],
            "preflight": preflight,
            "superseded_artifacts": superseded,
            "timestamp": request_payload["created_at"],
        }
        event["result_fingerprint"] = canonical_hash(event)
        append_jsonl(ledger_path, event)
    except Exception as exc:
        write_bytes_atomic(state_path, state_before)
        if ledger_before is not None:
            write_bytes_atomic(ledger_path, ledger_before)
        elif ledger_path.exists():
            ledger_path.unlink()
        for path in (bundle_path, manifest_path, prompt_path, schema_path, diff_path, request_path):
            if path.exists():
                path.unlink()
        for archived_ref in superseded:
            archived = root / archived_ref
            original = archived.with_name(archived.name.split(".invalid-controller-artifact.", 1)[0])
            write_bytes_atomic(original, archived.read_bytes())
            archived.unlink()
        raise ContractError(f"external review regeneration rolled back: {exc}") from exc
    return {
        "status": "PASS",
        "story_id": story_id,
        "run_id": run_id,
        "iteration": iteration,
        "generation": generation,
        "repair_round": story.get("repair_round"),
        "bundle_ref": bundle_ref,
        "manifest_ref": manifest_ref,
        "schema_ref": schema_ref,
        "prompt_ref": prompt_ref,
        "request_ref": request_path.relative_to(root).as_posix(),
        "expected_result_ref": result_ref,
        "request_fingerprint": request_payload["request_fingerprint"],
        "superseded_artifacts": superseded,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--ledger", required=True, type=Path)
    parser.add_argument("--story-id", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--iteration", required=True, type=int)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--input-fingerprint", required=True)
    parser.add_argument("--story-fingerprint", required=True)
    parser.add_argument("--source-bundle", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--recovery-label", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.project_root, args.state, args.ledger, story_id=args.story_id, run_id=args.run_id, iteration=args.iteration, generation=args.generation, input_fingerprint=args.input_fingerprint, story_fingerprint=args.story_fingerprint, source_bundle=args.source_bundle, output_dir=args.output_dir, recovery_label=args.recovery_label), ensure_ascii=False, sort_keys=True))
        return 0
    except (ContractError, OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
