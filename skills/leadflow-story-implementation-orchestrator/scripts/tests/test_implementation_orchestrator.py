#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import done_gate  # noqa: E402
from capture_snapshot import capture  # noqa: E402
from dependency_gate import evaluate as evaluate_dependencies  # noqa: E402
from done_gate import apply_done, evaluate_predicates  # noqa: E402
from handoff_gate import verify as verify_handoff  # noqa: E402
from import_external_evidence import validate as validate_external_evidence  # noqa: E402
from import_external_review import import_review  # noqa: E402
from lib import ContractError, attach_provenance, canonical_hash, frozen_fingerprint, load_json, now_utc, result_fingerprint, root_runtime, sha256_file, snapshot_workspace, workspace_fingerprint, write_bytes_atomic, write_json_atomic  # noqa: E402
from record_transition import transition  # noqa: E402
from register_external_evidence import register as register_external_request  # noqa: E402
from request_external_review import request as request_external_review  # noqa: E402
from resume_from_integrity_block import resume as resume_integrity_block  # noqa: E402
from prepare_external_review import prepare as prepare_external_review  # noqa: E402
from route_story import route as route_story  # noqa: E402
from scope_gate import evaluate as evaluate_scope  # noqa: E402
from validation_gate import evaluate_checks, main as validation_gate_main  # noqa: E402
from verify_external_review_bundle import verify as verify_external_review_bundle  # noqa: E402
from freeze_artifact import freeze  # noqa: E402


class ImplementationOrchestratorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.runtime = self.root / "_bmad-output" / "orchestration" / "leadflow-story-implementation"
        self.runtime.mkdir(parents=True)
        write_json_atomic(self.runtime / "frozen-artifacts.json", {"schema_version": "1.0", "artifacts": {}})
        write_json_atomic(self.runtime / "baseline-snapshots.json", {"schema_version": "1.0", "snapshots": {}})
        write_json_atomic(self.runtime / "external-evidence-requests.json", {"schema_version": "1.0", "requests": {}})
        write_json_atomic(self.runtime / "state.json", self.base_state("PENDING"))
        self.ledger = self.runtime / "evidence-ledger.jsonl"
        self.ledger.touch()
        self.story_dir = self.root / "_bmad-output" / "implementation-artifacts"
        self.story_dir.mkdir(parents=True)
        self.story_file = self.story_dir / "1-1-first.md"
        self.story_file.write_text("# E1-S1\n\nStatus: ready-for-dev\n\nAcceptance Criteria\n", encoding="utf-8")
        (self.story_dir / "1-2-other.md").write_text("# E1-S2\n\nStatus: ready-for-dev\n", encoding="utf-8")
        planning = self.root / "_bmad-output" / "planning-artifacts"
        (planning / "prds" / "current").mkdir(parents=True)
        (planning / "architecture" / "current").mkdir(parents=True)
        (planning / "ux-designs" / "current").mkdir(parents=True)
        (planning / "prds" / "current" / "prd.md").write_text("PRD\n", encoding="utf-8")
        (planning / "architecture" / "current" / "ARCHITECTURE-SPINE.md").write_text("ARCH\n", encoding="utf-8")
        (planning / "ux-designs" / "current" / "DESIGN.md").write_text("UX\n", encoding="utf-8")
        (planning / "ux-designs" / "current" / "EXPERIENCE.md").write_text("EXP\n", encoding="utf-8")
        (planning / "epics.md").write_text("EPICS\n", encoding="utf-8")
        (self.root / ".env").write_text("SECRET=hidden\n", encoding="utf-8")
        self.readiness = self.root / "_bmad-output" / "orchestration" / "leadflow-story-readiness"
        self.readiness.mkdir(parents=True)
        self.run_id = "RUN-1"
        self.iteration = 1
        self.generation = 1
        self.input_fingerprint = "a" * 64
        self.story_fingerprint = sha256_file(self.story_file)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def base_state(self, status: str = "CANDIDATE_DONE", execution_type: str = "IMPLEMENTATION") -> dict:
        return {
            "schema_version": "1.0",
            "workflow": "leadflow-story-implementation-orchestrator",
            "runtime_status": "RUNNING",
            "revision": 1,
            "active_story_id": "E1-S1",
            "stories": [{"story_id": "E1-S1", "story_file": "_bmad-output/implementation-artifacts/1-1-first.md", "status": status, "dependencies": [], "execution_type": execution_type}],
        }

    def context(self) -> dict:
        return {
            "story_id": "E1-S1",
            "run_id": self.run_id,
            "iteration": self.iteration,
            "generation": self.generation,
            "input_fingerprint": self.input_fingerprint,
            "story_fingerprint": self.story_fingerprint,
        }

    def execution_proposal(self, execution_type: str = "IMPLEMENTATION") -> dict:
        return {
            "schema_version": "1.0",
            "story_id": "E1-S1",
            "execution_type": execution_type,
            "classification_source": "workflow_llm_proposal",
            "classification_basis": {
                "requires_application_code": execution_type != "OPERATIONAL",
                "requires_external_evidence": execution_type != "IMPLEMENTATION",
            },
            "required_gates": {
                "implementation": execution_type != "OPERATIONAL",
                "external_evidence": execution_type != "IMPLEMENTATION",
                "validation": True,
                "review": True,
            },
            "source_refs": ["_bmad-output/implementation-artifacts/1-1-first.md"],
            **self.context(),
        }

    def validation_proposal(self, requirement: str = "NOT_APPLICABLE", execution_type: str = "IMPLEMENTATION") -> dict:
        return {
            "schema_version": "1.0",
            "story_id": "E1-S1",
            "execution_type": execution_type,
            "checks": [{
                "check_id": "product-tests",
                "name": "Product tests",
                "category": "story_tests",
                "requirement": requirement,
                "condition": {} if requirement == "CONDITIONAL" else None,
                "command": None,
                "destructive": False,
                "evidence_required": True,
                "justification": "No product test framework exists for this fixture" if requirement == "NOT_APPLICABLE" else "Required by story risk",
            }],
            **self.context(),
        }

    def scope_proposal(self, entries: list[dict] | None = None) -> dict:
        return {
            "schema_version": "1.0",
            "story_id": "E1-S1",
            "baseline_commit": "fixture-baseline",
            "path_classification": entries or [{
                "path": "_bmad-output/implementation-artifacts/1-1-first.md",
                "category": "DEV_WRITABLE",
                "justification": "BMad story task/status projection",
            }],
            "source_refs": ["_bmad-output/implementation-artifacts/1-1-first.md"],
            **self.context(),
        }

    def freeze_fixture(self, kind: str, proposal: dict, name: str) -> Path:
        proposal_path = self.root / f"{name}.proposal.json"
        output_path = self.runtime / name
        write_json_atomic(proposal_path, proposal)
        freeze(kind, self.root, proposal_path, output_path)
        return output_path

    def freeze_required(self, validation_requirement: str = "NOT_APPLICABLE", scope_entries: list[dict] | None = None, execution_type: str = "IMPLEMENTATION") -> dict:
        self.story_fingerprint = sha256_file(self.story_file)
        execution = self.freeze_fixture("execution-type", self.execution_proposal(execution_type), "story_execution_type.json")
        validation = self.freeze_fixture("validation-plan", self.validation_proposal(validation_requirement, execution_type), "validation-plan.json")
        scope = self.freeze_fixture("scope-manifest", self.scope_proposal(scope_entries), "scope-manifest.json")
        return {"execution": execution, "validation": validation, "scope": scope}

    def frozen_context(self) -> dict:
        from lib import validate_required_frozen_artifacts
        return validate_required_frozen_artifacts(self.root, **self.context())

    def capture_baseline(self, name: str = "baseline.json") -> Path:
        output = self.runtime / name
        capture(self.root, output, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=self.generation, baseline_commit="fixture-baseline")
        return output

    def make_result(self, name: str, producer: str, gate: str, *, status: str = "PASS", run_id: str | None = None, story_id: str = "E1-S1", extra: dict | None = None) -> Path:
        output = self.runtime / "results" / f"{name}.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        ctx = self.context()
        ctx["run_id"] = run_id or self.run_id
        ctx["story_id"] = story_id
        frozen = self.frozen_context()
        payload = {"status": status, "failures": [], "findings": [], "checks": []}
        if producer in {"validation_gate", "independent_reviewer"} or gate == "FINAL_SCOPE_GATE":
            payload["workspace_fingerprint"] = workspace_fingerprint(self.root)
            payload["checked_at"] = now_utc()
        if producer == "independent_reviewer":
            execution_type = load_json(self.runtime / "story_execution_type.json")["execution_type"]
            payload.update({
                "review_type": {
                    "IMPLEMENTATION": "CODE_REVIEW",
                    "OPERATIONAL": "OPERATIONAL_EVIDENCE_REVIEW",
                    "HYBRID": "HYBRID_REVIEW",
                }[execution_type],
                "reviewer_runtime_independence": "context_isolated_same_runtime",
            })
            if execution_type == "HYBRID":
                payload["review_components"] = ["CODE_REVIEW", "OPERATIONAL_EVIDENCE_REVIEW"]
        if extra:
            payload.update(extra)
        refs = [f"EV-{name}-{ctx['run_id']}-{ctx['iteration']}-{ctx['generation']}"]
        result = attach_provenance(payload, frozen_artifacts=frozen, evidence_ledger=self.ledger.relative_to(self.root).as_posix(), evidence_refs=refs, producer=producer, gate=gate, result_artifact_ref=output.relative_to(self.root).as_posix(), **ctx)
        write_json_atomic(output, result)
        self.ledger.parent.mkdir(parents=True, exist_ok=True)
        with self.ledger.open("a", encoding="utf-8") as handle:
            json.dump({"evidence_id": refs[0], "story_id": ctx["story_id"], "run_id": ctx["run_id"], "iteration": ctx["iteration"], "generation": ctx["generation"], "input_fingerprint": ctx["input_fingerprint"], "story_fingerprint": ctx["story_fingerprint"], "producer": producer, "gate": gate, "artifact_ref": output.relative_to(self.root).as_posix(), "result_fingerprint": result["provenance"]["result_fingerprint"], "frozen_artifacts": frozen, "status": status, **({"workspace_fingerprint": result["workspace_fingerprint"], "timestamp": result["checked_at"]} if "workspace_fingerprint" in result else {})}, handle)
            handle.write("\n")
        return output

    def done_inputs(self, validation_requirement: str = "NOT_APPLICABLE", scope_entries: list[dict] | None = None, execution_type: str = "IMPLEMENTATION") -> dict[str, Path]:
        self.story_file.write_text("# E1-S1\n\nStatus: review\n", encoding="utf-8")
        self.story_fingerprint = sha256_file(self.story_file)
        if execution_type == "OPERATIONAL" and scope_entries is None:
            scope_entries = [{"path": "_bmad-output/implementation-artifacts/1-1-first.md", "category": "CONTROLLER_ONLY", "justification": "DONE_GATE status projection only"}]
        self.freeze_required(validation_requirement, scope_entries, execution_type)
        write_json_atomic(self.runtime / "state.json", self.base_state(execution_type=execution_type))
        return {
            "validation_plan_path": self.runtime / "validation-plan.json",
            "validation_result_path": self.make_result("validation", "validation_gate", "VALIDATING"),
            "review_result_path": self.make_result("review", "independent_reviewer", "REVIEWING"),
            "scope_result_path": self.make_result("scope", "scope_gate", "SCOPE_GATE"),
            "final_scope_result_path": self.make_result("final-scope", "scope_gate", "FINAL_SCOPE_GATE"),
            "readiness_result_path": self.make_result("readiness", "handoff_gate", "HANDOFF"),
            "dependency_result_path": self.make_result("dependency", "dependency_gate", "DEPENDENCY_GATE"),
        }

    def done_predicates(self, inputs: dict[str, Path]) -> dict:
        return evaluate_predicates(project_root=self.root, state_path=self.runtime / "state.json", story_file=self.story_file, ledger_path=self.ledger, **self.context(), **inputs)

    def test_validation_gate_accepts_registered_frozen_plan(self) -> None:
        frozen = self.freeze_required(validation_requirement="REQUIRED")
        result_input = self.runtime / "validation-input.json"
        output = self.runtime / "validation-result.json"
        write_json_atomic(result_input, {"checks": [{"check_id": "product-tests", "status": "PASS"}]})
        ctx = self.context()
        argv = [
            "validation_gate.py",
            "--project-root", str(self.root),
            "--plan", str(frozen["validation"]),
            "--result-input", str(result_input),
            "--output", str(output),
            "--ledger", str(self.ledger),
            "--story-id", ctx["story_id"],
            "--run-id", ctx["run_id"],
            "--iteration", str(ctx["iteration"]),
            "--generation", str(ctx["generation"]),
            "--input-fingerprint", ctx["input_fingerprint"],
            "--story-fingerprint", ctx["story_fingerprint"],
        ]
        with patch.object(sys, "argv", argv):
            self.assertEqual(validation_gate_main(), 0)
        self.assertEqual(load_json(output)["status"], "PASS")

    def test_llm_proposal_cannot_write_frozen_manifest_directly(self) -> None:
        proposal_path = self.root / "same.json"
        write_json_atomic(proposal_path, self.execution_proposal())
        with self.assertRaises(ContractError):
            freeze("execution-type", self.root, proposal_path, proposal_path)

    def test_normative_path_as_writable_fails(self) -> None:
        path = self.root / "scope.proposal.json"
        write_json_atomic(path, self.scope_proposal([{"path": "_bmad-output/planning-artifacts/prds/current/prd.md", "category": "DEV_WRITABLE", "justification": "invalid"}]))
        with self.assertRaises(ContractError):
            freeze("scope-manifest", self.root, path, self.runtime / "scope-manifest.json")

    def test_path_traversal_fails(self) -> None:
        path = self.root / "scope.proposal.json"
        write_json_atomic(path, self.scope_proposal([{"path": "../escape.txt", "category": "DEV_WRITABLE", "justification": "invalid"}]))
        with self.assertRaises(ContractError):
            freeze("scope-manifest", self.root, path, self.runtime / "scope-manifest.json")

    def test_symlink_escape_fails(self) -> None:
        outside = Path(self.temp.name).parent / f"outside-{id(self)}"
        outside.mkdir()
        try:
            (self.root / "link.txt").symlink_to(outside / "secret.txt")
            path = self.root / "scope.proposal.json"
            write_json_atomic(path, self.scope_proposal([{"path": "link.txt", "category": "DEV_WRITABLE", "justification": "invalid"}]))
            with self.assertRaises(ContractError):
                freeze("scope-manifest", self.root, path, self.runtime / "scope-manifest.json")
        finally:
            outside.rmdir()

    def test_required_validation_absent_blocks_done(self) -> None:
        inputs = self.done_inputs(validation_requirement="REQUIRED")
        self.assertEqual(self.done_predicates(inputs)["status"], "FAIL")

    def test_not_applicable_with_justification_is_allowed(self) -> None:
        plan_path = self.freeze_fixture("validation-plan", self.validation_proposal("NOT_APPLICABLE"), "validation-plan.json")
        self.assertEqual(evaluate_checks(load_json(plan_path), {"checks": []})["status"], "PASS")

    def test_fast_strict_routing_is_deterministic(self) -> None:
        self.story_file.write_text("# E1-S1\n\nRisk: LOW\n\nCapture a lead locally.\n", encoding="utf-8")
        self.assertEqual(route_story(self.story_file, execution_type="IMPLEMENTATION")["workflow_mode"], "FAST")
        self.story_file.write_text("# E1-S1\n\nRisk: HIGH\n\nUpdate ownership.\n", encoding="utf-8")
        self.assertEqual(route_story(self.story_file, execution_type="IMPLEMENTATION")["workflow_mode"], "STRICT")
        self.story_file.write_text("# E1-S1\n\nRisk: LOW\n\nOperational evidence.\n", encoding="utf-8")
        self.assertEqual(route_story(self.story_file, execution_type="OPERATIONAL")["workflow_mode"], "STRICT")

    def test_frozen_execution_artifact_records_workflow_mode(self) -> None:
        frozen = self.freeze_fixture("execution-type", self.execution_proposal("IMPLEMENTATION"), "story_execution_type.json")
        execution = load_json(frozen)
        self.assertEqual(execution["workflow_mode"], "STRICT")
        self.assertIn("risk_not_explicit", execution["workflow_mode_reasons"])

    def test_runtime_unavailability_uses_awaiting_external_review(self) -> None:
        self.freeze_required()
        write_json_atomic(self.runtime / "state.json", self.base_state("REVIEWING"))
        bundle = self.runtime / "review-bundle.json"
        write_json_atomic(bundle, {"story_id": "E1-S1", "immutable": True})
        result_path = self.runtime / "review-result.json"
        request_path = self.runtime / "external-review-request.json"
        response = request_external_review(self.root, self.runtime / "state.json", self.ledger, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=self.generation, bundle_path=bundle, result_path=result_path, request_path=request_path)
        self.assertEqual(response["state"], "AWAITING_EXTERNAL_REVIEW")
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["status"], "AWAITING_EXTERNAL_REVIEW")
        self.assertNotEqual(load_json(self.runtime / "state.json")["stories"][0]["status"], "NEEDS_USER_DECISION")

    def test_external_review_state_round_trip_is_allowed(self) -> None:
        write_json_atomic(self.runtime / "state.json", self.base_state("REVIEWING"))
        transition(self.runtime / "state.json", "E1-S1", "AWAITING_EXTERNAL_REVIEW", "reviewer runtime unavailable")
        transition(self.runtime / "state.json", "E1-S1", "REVIEWING", "structured result imported")
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["status"], "REVIEWING")

    def test_external_review_import_resumes_when_result_is_valid(self) -> None:
        self.freeze_required()
        write_json_atomic(self.runtime / "state.json", self.base_state("REVIEWING"))
        bundle = self.runtime / "review-bundle.json"
        write_json_atomic(bundle, {"story_id": "E1-S1", "immutable": True})
        result_path = self.runtime / "review-result.json"
        request_external_review(self.root, self.runtime / "state.json", self.ledger, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=self.generation, bundle_path=bundle, result_path=result_path, request_path=self.runtime / "external-review-request.json")
        raw_path = self.root / "external-review.json"
        raw = load_json(self.make_result("external-review-source", "independent_reviewer", "REVIEWING"))
        raw.update(self.context())
        raw["result_fingerprint"] = raw["provenance"]["result_fingerprint"]
        raw["provenance"]["result_fingerprint"] = result_fingerprint(raw)
        write_json_atomic(raw_path, raw)
        output = self.runtime / "imported-review.json"
        imported = import_review(self.root, self.runtime / "state.json", self.ledger, input_path=raw_path, output_path=output, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=self.generation, input_fingerprint=self.input_fingerprint, story_fingerprint=self.story_fingerprint)
        self.assertEqual(imported["status"], "PASS")
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["status"], "REVIEWING")
        self.assertEqual(load_json(output)["imported_from"], "external-review.json")

    def _review_schema_template(self) -> dict:
        context = self.context()
        return {
            "type": "object",
            "properties": {
                **{key: {"const": context[key]} for key in ("story_id", "run_id", "iteration", "generation", "input_fingerprint", "story_fingerprint")},
                "provenance": {
                    "properties": {
                        **{key: {"const": context[key]} for key in ("story_id", "run_id", "iteration", "generation", "input_fingerprint", "story_fingerprint")},
                        "frozen_artifacts": {"const": {}},
                        "evidence_ledger": {"const": ""},
                        "evidence_refs": {"const": []},
                        "result_artifact_ref": {"const": ""},
                    }
                },
            },
        }

    def _prepare_generation_two_review_fixture(self, *, source_text: str = "# E4-S2 bundle\n\nGeneration 2\n", label: str = "recovery-2") -> tuple[Path, dict]:
        self.generation = 2
        self.story_fingerprint = sha256_file(self.story_file)
        self.freeze_required()
        state = self.base_state("AWAITING_EXTERNAL_REVIEW")
        state["stories"][0].update({
            "run_id": self.run_id,
            "iteration": self.iteration,
            "generation": 2,
            "repair_round": 2,
            "input_fingerprint": self.input_fingerprint,
            "story_fingerprint": self.story_fingerprint,
            "external_review_request": {
                "request_id": "old",
                "request_ref": "_bmad-output/orchestration/leadflow-story-implementation/old-request.json",
                "expected_result_ref": "_bmad-output/orchestration/leadflow-story-implementation/old-result.json",
                "bundle_ref": "old",
                "status": "AWAITING_EXTERNAL_REVIEW",
            },
            "blockers_open": ["CR-OLD"],
        })
        write_json_atomic(self.runtime / "state.json", state)
        write_json_atomic(self.runtime / "old-request.json", {"generation": 1})
        write_json_atomic(self.runtime / "old-result.json", {"generation": 1})
        output_dir = self.runtime / "generation-2"
        output_dir.mkdir()
        write_json_atomic(output_dir / "review-result.schema.json", self._review_schema_template())
        write_bytes_atomic(output_dir / "implementation.diff", b"diff --git a/lib/example.ts b/lib/example.ts\n")
        write_json_atomic(output_dir / "validation-result.json", {"status": "PASS"})
        source_bundle = self.runtime / "review-bundle.md"
        source_bundle.write_text(source_text, encoding="utf-8")
        result = prepare_external_review(self.root, self.runtime / "state.json", self.ledger, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=2, input_fingerprint=self.input_fingerprint, story_fingerprint=self.story_fingerprint, source_bundle=source_bundle, output_dir=output_dir, recovery_label=label)
        return output_dir, result

    def test_generation_scoped_review_contract_has_no_stale_generation(self) -> None:
        output_dir, result = self._prepare_generation_two_review_fixture()
        self.assertEqual(result["generation"], 2)
        for name in ("review-bundle.recovery-2.md", "review-bundle.recovery-2.manifest.json", "review-prompt.recovery-2.md", "review-result.recovery-2.schema.json", "external-review-request.recovery-2.json"):
            content = (output_dir / name).read_text(encoding="utf-8")
            self.assertNotIn('"generation": 1', content)
            self.assertIsNone(re.search(r'-1-1(?=["\'`\\s,.)\\]}]|$)', content))
        request = load_json(output_dir / "external-review-request.recovery-2.json")
        schema = load_json(output_dir / "review-result.recovery-2.schema.json")
        self.assertEqual(request["generation"], 2)
        self.assertEqual(schema["properties"]["generation"]["const"], 2)
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["external_review_request"]["generation"], 2)
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["blockers_open"], [])
        self.assertTrue(list(self.runtime.glob("old-result.json.invalid-controller-artifact.*")))
        preflight = verify_external_review_bundle(self.root, output_dir / "review-bundle.recovery-2.manifest.json", **self.context())
        self.assertEqual(preflight["status"], "PASS")

    def test_generation_two_schema_shaped_result_imports(self) -> None:
        _output_dir, prepared = self._prepare_generation_two_review_fixture()
        frozen = self.frozen_context()
        evidence_ref = "EV-CODE-REVIEW-E1-S1-RUN-1-1-2"
        raw = {
            "status": "PASS",
            "review_type": "CODE_REVIEW",
            "reviewer_runtime_independence": "separate_reviewer_runtime",
            **self.context(),
            "workspace_fingerprint": workspace_fingerprint(self.root),
            "checked_at": now_utc(),
            "findings": [],
            "evidence_refs": [evidence_ref],
            "provenance": {
                **self.context(),
                "frozen_artifacts": frozen,
                "evidence_ledger": "_bmad-output/orchestration/leadflow-story-implementation/evidence-ledger.jsonl",
                "evidence_refs": [evidence_ref],
                "producer": "independent_reviewer",
                "gate": "REVIEWING",
                "result_artifact_ref": prepared["expected_result_ref"],
            },
        }
        raw["provenance"]["result_fingerprint"] = result_fingerprint(raw)
        raw_path = self.root / "generation-two-review.json"
        write_json_atomic(raw_path, raw)
        imported = import_review(self.root, self.runtime / "state.json", self.ledger, input_path=raw_path, output_path=self.runtime / "imported-review.json", story_id="E1-S1", run_id=self.run_id, iteration=1, generation=2, input_fingerprint=self.input_fingerprint, story_fingerprint=self.story_fingerprint)
        self.assertEqual(imported["status"], "PASS")

    def test_external_review_bundle_preflight_rejects_stale_schema_generation(self) -> None:
        output_dir, _prepared = self._prepare_generation_two_review_fixture()
        schema = load_json(output_dir / "review-result.recovery-2.schema.json")
        schema["properties"]["generation"]["const"] = 1
        write_json_atomic(output_dir / "review-result.recovery-2.schema.json", schema)
        with self.assertRaises(ContractError):
            verify_external_review_bundle(self.root, output_dir / "review-bundle.recovery-2.manifest.json", **self.context())

    def test_external_review_bundle_preflight_rejects_stale_schema_sha_in_bundle(self) -> None:
        stale_sha = "b" * 64
        output_dir, _prepared = self._prepare_generation_two_review_fixture()
        bundle = output_dir / "review-bundle.recovery-2.md"
        bundle.write_text(bundle.read_text(encoding="utf-8") + "\nReview result schema `" + stale_sha + "`\n", encoding="utf-8")
        with self.assertRaises(ContractError):
            verify_external_review_bundle(self.root, output_dir / "review-bundle.recovery-2.manifest.json", **self.context())

    def test_external_review_bundle_preflight_rejects_logical_lock_without_path(self) -> None:
        output_dir, _prepared = self._prepare_generation_two_review_fixture()
        manifest = load_json(output_dir / "review-bundle.recovery-2.manifest.json")
        manifest["artifacts"].append({"path": "complete_implementation_diff", "sha256": "c" * 64, "kind": "implementation_diff"})
        write_json_atomic(output_dir / "review-bundle.recovery-2.manifest.json", manifest)
        with self.assertRaises(ContractError):
            verify_external_review_bundle(self.root, output_dir / "review-bundle.recovery-2.manifest.json", **self.context())

    def test_external_review_bundle_preflight_locks_materialized_implementation_diff(self) -> None:
        output_dir, _prepared = self._prepare_generation_two_review_fixture()
        manifest = load_json(output_dir / "review-bundle.recovery-2.manifest.json")
        diff_entries = [entry for entry in manifest["artifacts"] if entry["kind"] == "implementation_diff"]
        self.assertEqual(len(diff_entries), 1)
        diff_path = output_dir / diff_entries[0]["path"]
        self.assertTrue(diff_path.exists())
        self.assertEqual(diff_entries[0]["sha256"], sha256_file(diff_path))

    def test_external_review_bundle_preflight_rejects_byte_modified_after_manifest(self) -> None:
        output_dir, _prepared = self._prepare_generation_two_review_fixture()
        bundle = output_dir / "review-bundle.recovery-2.md"
        bundle.write_text(bundle.read_text(encoding="utf-8") + "\nmutated\n", encoding="utf-8")
        with self.assertRaises(ContractError):
            verify_external_review_bundle(self.root, output_dir / "review-bundle.recovery-2.manifest.json", **self.context())

    def test_external_review_bundle_uses_physical_verifiable_artifact_paths(self) -> None:
        output_dir, _prepared = self._prepare_generation_two_review_fixture()
        manifest = load_json(output_dir / "review-bundle.recovery-2.manifest.json")
        self.assertIsInstance(manifest["artifacts"], list)
        for entry in manifest["artifacts"]:
            self.assertIn("path", entry)
            self.assertIn("sha256", entry)
            self.assertIn("kind", entry)
            self.assertNotEqual(entry["path"], "complete_implementation_diff")
            artifact_path = self.root / entry["path"] if entry["path"].startswith("_bmad-output/") else output_dir / entry["path"]
            self.assertTrue(artifact_path.exists())
        bundle = (output_dir / "review-bundle.recovery-2.md").read_text(encoding="utf-8")
        self.assertNotIn("Review result schema |", bundle)

    def test_preflight_failure_does_not_increment_generation_or_repair_round(self) -> None:
        source = "# E4-S2 bundle\n\nGeneration 2\n\nUnlocked SHA " + ("d" * 64) + "\n"
        with self.assertRaises(ContractError):
            self._prepare_generation_two_review_fixture(source_text=source)
        state = load_json(self.runtime / "state.json")["stories"][0]
        self.assertEqual(state["generation"], 2)
        self.assertEqual(state["repair_round"], 2)

    def test_generation_one_result_is_rejected_by_generation_two_import(self) -> None:
        self.generation = 2
        self.story_fingerprint = sha256_file(self.story_file)
        self.freeze_required()
        state = self.base_state("REVIEWING")
        state["stories"][0].update({"run_id": self.run_id, "iteration": self.iteration, "generation": 2, "repair_round": 2, "input_fingerprint": self.input_fingerprint, "story_fingerprint": self.story_fingerprint})
        write_json_atomic(self.runtime / "state.json", state)
        bundle = self.runtime / "review-bundle.json"
        write_json_atomic(bundle, {"story_id": "E1-S1", "generation": 2})
        request_path = self.runtime / "external-review-request.json"
        result_path = self.runtime / "review-result.json"
        request_external_review(self.root, self.runtime / "state.json", self.ledger, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=2, bundle_path=bundle, result_path=result_path, request_path=request_path)
        raw = load_json(self.make_result("external-review-source", "independent_reviewer", "REVIEWING"))
        raw["generation"] = 1
        raw["provenance"]["generation"] = 1
        raw_path = self.root / "generation-one-review.json"
        write_json_atomic(raw_path, raw)
        with self.assertRaises(ContractError):
            import_review(self.root, self.runtime / "state.json", self.ledger, input_path=raw_path, output_path=self.runtime / "imported-review.json", story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=2, input_fingerprint=self.input_fingerprint, story_fingerprint=self.story_fingerprint)

    def test_integrity_resume_rejects_replacement_from_previous_generation(self) -> None:
        self.generation = 2
        self.story_fingerprint = sha256_file(self.story_file)
        self.freeze_required()
        state = self.base_state("ESCALATED")
        state["stories"][0].update({"run_id": self.run_id, "iteration": self.iteration, "generation": 2, "repair_round": 2, "input_fingerprint": self.input_fingerprint, "story_fingerprint": self.story_fingerprint})
        write_json_atomic(self.runtime / "state.json", state)
        target = self.runtime / "external-review-request.json"
        source = self.runtime / "external-review-request.recovery-1.json"
        write_json_atomic(target, {"generation": 2, "request_fingerprint": "a" * 64})
        write_json_atomic(source, {"story_id": "E1-S1", "run_id": self.run_id, "iteration": 1, "generation": 1, "input_fingerprint": self.input_fingerprint, "story_fingerprint": self.story_fingerprint, "request_fingerprint": "b" * 64, "bundle_ref": "bundle", "expected_result_ref": "result"})
        with self.assertRaises(ContractError):
            resume_integrity_block(self.root, self.runtime / "state.json", self.ledger, story_id="E1-S1", run_id=self.run_id, iteration=1, generation=2, block_kind="PROVENANCE_METADATA", target_state="AWAITING_EXTERNAL_REVIEW", replacements=[f"{target}={source}"], preserved_results=[], input_fingerprint=self.input_fingerprint, story_fingerprint=self.story_fingerprint)
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["status"], "ESCALATED")

    def test_integrity_resume_preserves_generation_repair_round_and_history(self) -> None:
        write_json_atomic(self.runtime / "state.json", self.base_state("ESCALATED"))
        state = load_json(self.runtime / "state.json")
        state["stories"][0].update({"run_id": self.run_id, "iteration": self.iteration, "generation": 2, "repair_round": 2})
        write_json_atomic(self.runtime / "state.json", state)
        target = self.runtime / "review-bundle.json"
        source = self.runtime / "review-bundle.repaired.json"
        write_json_atomic(target, {"version": 1, "invalid": True})
        write_json_atomic(source, {"version": 2, "invalid": False})
        response = resume_integrity_block(self.root, self.runtime / "state.json", self.ledger, story_id="E1-S1", run_id=self.run_id, iteration=self.iteration, generation=2, block_kind="BUNDLE", target_state="AWAITING_EXTERNAL_REVIEW", replacements=[f"{target}={source}"], preserved_results=[])
        current = load_json(self.runtime / "state.json")["stories"][0]
        self.assertEqual(response["state"], "AWAITING_EXTERNAL_REVIEW")
        self.assertEqual(current["generation"], 2)
        self.assertEqual(current["repair_round"], 2)
        self.assertEqual(load_json(target)["version"], 2)
        self.assertEqual(len(response["history"]), 1)
        self.assertTrue((self.root / response["history"][0]["invalid_ref"]).exists())

    def test_atomic_done_gate_accepts_reviewing_without_candidate_state(self) -> None:
        inputs = self.done_inputs()
        state_path = self.runtime / "state.json"
        state = load_json(state_path)
        state["stories"][0]["status"] = "REVIEWING"
        write_json_atomic(state_path, state)
        predicates = self.done_predicates(inputs)
        result = apply_done(project_root=self.root, state_path=state_path, story_file=self.story_file, ledger_path=self.ledger, predicates=predicates)
        self.assertEqual(result["status"], "DONE")
        self.assertEqual(load_json(state_path)["stories"][0]["status"], "DONE")

    def external_request(self) -> dict:
        request = {
            "schema_version": "1.0",
            "request_id": "REQ-1",
            "story_id": "E1-S1",
            "run_id": self.run_id,
            "iteration": self.iteration,
            "generation": self.generation,
            "acceptance_criteria": [{"id": "AC1", "description": "protected evidence"}],
            "evidence_items": [{"id": "backup", "required": True}],
            "human_operations": ["operator evidence collection"],
            "orchestrator_forbidden_operations": ["remote backup or restore"],
            "postconditions": [{"id": "restore", "required": True}],
            "sensitive_fields_prohibited": ["secret", "token"],
            "staleness_policy": {"max_age_hours": 100000},
            "environment_policy": {"allowed_destinations": ["preview-isolated"], "forbidden_destinations": ["production"]},
            "local_artifact_policy": {"allowed_paths": [], "allowed_prefixes": ["_bmad-output/evidence/"]},
        }
        request["fingerprint"] = frozen_fingerprint(request)
        return request

    def external_request_file(self, *, registered: bool = True, request: dict | None = None) -> tuple[Path, dict]:
        request = request or self.external_request()
        path = self.runtime / "requests" / f"{request['request_id']}.json"
        write_json_atomic(path, request)
        if registered:
            register_external_request(self.root, path, story_id=request["story_id"], run_id=request["run_id"], iteration=request["iteration"], generation=request["generation"], ledger_path=self.ledger)
        return path, request

    def external_result(self, request: dict, *, references: list[dict] | None = None, **overrides: object) -> dict:
        result = {
            "schema_version": "1.0",
            "request_id": request["request_id"],
            "story_id": request["story_id"],
            "run_id": request["run_id"],
            "iteration": request["iteration"],
            "generation": request["generation"],
            "request_fingerprint": request["fingerprint"],
            "performed_by": "operator",
            "performed_at": "2099-01-01T00:00:00Z",
            "environment": {"destination": "preview-isolated"},
            "evidence_items": [{"id": "backup", "references": references if references is not None else [{"type": "EXTERNAL_ID", "ref": "backup-1", "verification_mode": "HUMAN_ATTESTED", "attestation": {"performed_by": "operator", "attested_at": "2099-01-01T00:00:00Z", "method": "protected report review"}}]}],
            "postcondition_results": [{"id": "restore", "status": "PASS"}],
            "redaction_declaration": {"secrets_removed": True, "private_rows_excluded": True, "raw_dumps_excluded": True},
            "notes": "redacted",
        }
        result.update(overrides)
        result["result_fingerprint"] = result_fingerprint(result)
        return result

    def test_external_evidence_incomplete_fails(self) -> None:
        request_path, request = self.external_request_file()
        result = self.external_result(request, references=[])
        with self.assertRaises(ContractError):
            validate_external_evidence(self.root, request_path, request, result, self.ledger)

    def test_external_evidence_wrong_request_story_run_fails(self) -> None:
        request_path, request = self.external_request_file()
        for overrides in ({"request_id": "WRONG"}, {"story_id": "E1-S2"}, {"run_id": "OTHER-RUN"}, {"generation": 99}):
            with self.subTest(overrides=overrides):
                result = self.external_result(request, **overrides)
                with self.assertRaises(ContractError):
                    validate_external_evidence(self.root, request_path, request, result, self.ledger)

    def test_external_evidence_secret_fails(self) -> None:
        request_path, request = self.external_request_file()
        result = self.external_result(request, api_key="secret-value")
        with self.assertRaises(ContractError):
            validate_external_evidence(self.root, request_path, request, result, self.ledger)

    def test_external_request_fabricated_self_consistent_fails(self) -> None:
        request_path, request = self.external_request_file(registered=False)
        result = self.external_result(request)
        with self.assertRaises(ContractError):
            validate_external_evidence(self.root, request_path, request, result, self.ledger)

    def test_external_request_registered_modified_fails(self) -> None:
        request_path, request = self.external_request_file()
        modified = dict(request)
        modified["acceptance_criteria"] = [{"id": "AC1", "description": "modified"}]
        modified["fingerprint"] = frozen_fingerprint(modified)
        write_json_atomic(request_path, modified)
        with self.assertRaises(ContractError):
            validate_external_evidence(self.root, request_path, modified, self.external_result(modified), self.ledger)

    def test_external_request_registered_intact_can_continue(self) -> None:
        request_path, request = self.external_request_file()
        imported = validate_external_evidence(self.root, request_path, request, self.external_result(request), self.ledger)
        self.assertEqual(imported["status"], "PASS")

    def test_local_artifact_false_hash_fails(self) -> None:
        evidence = self.root / "_bmad-output" / "evidence" / "report.json"
        evidence.parent.mkdir(parents=True)
        evidence.write_text("{\"status\": \"PASS\"}\n", encoding="utf-8")
        request_path, request = self.external_request_file()
        result = self.external_result(request, references=[{"type": "LOCAL_ARTIFACT", "ref": "_bmad-output/evidence/report.json", "sha256": "b" * 64}])
        with self.assertRaises(ContractError):
            validate_external_evidence(self.root, request_path, request, result, self.ledger)

    def test_local_artifact_correct_hash_passes(self) -> None:
        evidence = self.root / "_bmad-output" / "evidence" / "report.json"
        evidence.parent.mkdir(parents=True)
        evidence.write_text("{\"status\": \"PASS\"}\n", encoding="utf-8")
        request_path, request = self.external_request_file()
        result = self.external_result(request, references=[{"type": "LOCAL_ARTIFACT", "ref": "_bmad-output/evidence/report.json", "sha256": sha256_file(evidence)}])
        imported = validate_external_evidence(self.root, request_path, request, result, self.ledger)
        self.assertEqual(imported["status"], "PASS")
        self.assertTrue(imported["evidence_items"][0]["references"][0]["hash_verified"])

    def test_operational_story_cannot_enter_implementing(self) -> None:
        state_path = self.runtime / "state.json"
        write_json_atomic(state_path, self.base_state("SCOPE_LOCKED", "OPERATIONAL"))
        with self.assertRaises(ContractError):
            transition(state_path, "E1-S1", "IMPLEMENTING", "test")

    def test_implementation_story_cannot_skip_validation(self) -> None:
        state_path = self.runtime / "state.json"
        write_json_atomic(state_path, self.base_state("SCOPE_LOCKED", "IMPLEMENTATION"))
        with self.assertRaises(ContractError):
            transition(state_path, "E1-S1", "REVIEWING", "test")

    def test_invalidated_readiness_blocks_handoff(self) -> None:
        state = {"stories": [{"story_id": "E1-S1", "status": "READY_FOR_DEV", "invalidated": True, "fingerprint": {"value": sha256_file(self.story_file)}, "evidence_refs": ["EV-READY"]}]}
        write_json_atomic(self.readiness / "state.json", state)
        (self.readiness / "evidence-ledger.jsonl").write_text(json.dumps({"evidence_id": "EV-READY", "final_verdict": "PASS"}) + "\n", encoding="utf-8")
        self.assertEqual(verify_handoff(self.root, self.readiness, "E1-S1", self.story_file)["status"], "ESCALATED")

    def test_handoff_accepts_certified_bmad_status_projection_drift(self) -> None:
        current = self.story_file.read_text(encoding="utf-8")
        readiness_content = current.replace("Status: ready-for-dev", "Status: ready-for-revalidation")
        readiness_hash = __import__("hashlib").sha256(readiness_content.encode("utf-8")).hexdigest()
        state = {"stories": [{
            "story_id": "E1-S1",
            "status": "READY_FOR_DEV",
            "source_status_observed": "ready-for-revalidation",
            "fingerprint": {"value": readiness_hash},
            "evidence_refs": ["EV-READY"],
        }]}
        write_json_atomic(self.readiness / "state.json", state)
        (self.readiness / "evidence-ledger.jsonl").write_text(json.dumps({"evidence_id": "EV-READY", "final_verdict": "PASS"}) + "\n", encoding="utf-8")
        result = verify_handoff(self.root, self.readiness, "E1-S1", self.story_file)
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(result["projection_reconciled"])

    def test_dependency_not_done_blocks(self) -> None:
        readiness = self.root / "readiness-state.json"
        implementation = self.root / "implementation-state.json"
        write_json_atomic(readiness, {"stories": [{"story_id": "E1-S2", "status": "READY_FOR_DEV", "dependencies": ["E1-S1"]}]})
        write_json_atomic(implementation, {"stories": [{"story_id": "E1-S1", "story_file": "_bmad-output/implementation-artifacts/1-1-first.md", "status": "READY_FOR_IMPLEMENTATION", "dependencies": [], "execution_type": "IMPLEMENTATION"}]})
        self.assertEqual(evaluate_dependencies(readiness, implementation, "E1-S2")["status"], "FAIL")

    def test_done_with_fabricated_scope_result_fails(self) -> None:
        inputs = self.done_inputs()
        fabricated = self.runtime / "results" / "fabricated-scope.json"
        write_json_atomic(fabricated, {"status": "PASS"})
        inputs["scope_result_path"] = fabricated
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_done_with_other_run_review_fails(self) -> None:
        inputs = self.done_inputs()
        inputs["review_result_path"] = self.make_result("review-other-story-run", "independent_reviewer", "REVIEWING", run_id="OTHER-RUN", story_id="E1-S2")
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_done_without_required_frozen_artifact_fails(self) -> None:
        inputs = self.done_inputs()
        registry = load_json(self.runtime / "frozen-artifacts.json")
        registry["artifacts"].pop("_bmad-output/orchestration/leadflow-story-implementation/scope-manifest.json")
        write_json_atomic(self.runtime / "frozen-artifacts.json", registry)
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_only_done_gate_can_write_done(self) -> None:
        state_path = self.runtime / "state.json"
        write_json_atomic(state_path, self.base_state("CANDIDATE_DONE"))
        with self.assertRaises(ContractError):
            transition(state_path, "E1-S1", "DONE", "test")

    def test_done_open_p1_finding_fails(self) -> None:
        inputs = self.done_inputs()
        inputs["review_result_path"] = self.make_result("review-open", "independent_reviewer", "REVIEWING", extra={"findings": [{"id": "F1", "severity": "P1", "status": "OPEN"}]})
        self.assertEqual(self.done_predicates(inputs)["status"], "FAIL")

    def test_operational_done_accepts_operational_evidence_review(self) -> None:
        inputs = self.done_inputs(execution_type="OPERATIONAL")
        self.assertEqual(self.done_predicates(inputs)["status"], "PASS")

    def test_operational_done_requires_evidence_review_not_code_review(self) -> None:
        inputs = self.done_inputs(execution_type="OPERATIONAL")
        inputs["review_result_path"] = self.make_result("operational-code-review", "independent_reviewer", "REVIEWING", extra={"review_type": "CODE_REVIEW"})
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_implementation_done_requires_code_review(self) -> None:
        inputs = self.done_inputs(execution_type="IMPLEMENTATION")
        inputs["review_result_path"] = self.make_result("implementation-evidence-review", "independent_reviewer", "REVIEWING", extra={"review_type": "OPERATIONAL_EVIDENCE_REVIEW"})
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_project_fast_review_waiver_can_close_when_runtime_review_unavailable(self) -> None:
        inputs = self.done_inputs(execution_type="IMPLEMENTATION")
        inputs["review_result_path"] = self.make_result(
            "project-fast-waiver",
            "project_fast_policy",
            "PROJECT_FAST",
            status="WAIVED_UNAVAILABLE_RUNTIME",
            extra={
                "review": "WAIVED_UNAVAILABLE_RUNTIME",
                "review_type": "REVIEW_WAIVED_UNAVAILABLE_RUNTIME",
                "runtime_independence_available": False,
                "validations_required_pass": True,
                "known_p0_p1_open": False,
                "product_decision_pending": False,
                "architecture_decision_pending": False,
                "remote_or_destructive_operation_pending": False,
                "workspace_fingerprint": workspace_fingerprint(self.root),
                "checked_at": now_utc(),
            },
        )
        self.assertEqual(self.done_predicates(inputs)["status"], "PASS")

    def test_project_fast_review_waiver_rejects_known_p1_open(self) -> None:
        inputs = self.done_inputs(execution_type="IMPLEMENTATION")
        inputs["review_result_path"] = self.make_result(
            "project-fast-waiver-open",
            "project_fast_policy",
            "PROJECT_FAST",
            status="WAIVED_UNAVAILABLE_RUNTIME",
            extra={
                "review": "WAIVED_UNAVAILABLE_RUNTIME",
                "review_type": "REVIEW_WAIVED_UNAVAILABLE_RUNTIME",
                "runtime_independence_available": False,
                "validations_required_pass": True,
                "known_p0_p1_open": ["F1"],
                "product_decision_pending": False,
                "architecture_decision_pending": False,
                "remote_or_destructive_operation_pending": False,
                "workspace_fingerprint": workspace_fingerprint(self.root),
                "checked_at": now_utc(),
            },
        )
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_project_fast_review_waiver_rejects_available_runtime_review(self) -> None:
        inputs = self.done_inputs(execution_type="IMPLEMENTATION")
        inputs["review_result_path"] = self.make_result(
            "project-fast-waiver-runtime-available",
            "project_fast_policy",
            "PROJECT_FAST",
            status="WAIVED_UNAVAILABLE_RUNTIME",
            extra={
                "review": "WAIVED_UNAVAILABLE_RUNTIME",
                "review_type": "REVIEW_WAIVED_UNAVAILABLE_RUNTIME",
                "runtime_independence_available": True,
                "validations_required_pass": True,
                "known_p0_p1_open": False,
                "product_decision_pending": False,
                "architecture_decision_pending": False,
                "remote_or_destructive_operation_pending": False,
                "workspace_fingerprint": workspace_fingerprint(self.root),
                "checked_at": now_utc(),
            },
        )
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_project_fast_review_waiver_rejects_missing_validation_pass(self) -> None:
        inputs = self.done_inputs(execution_type="IMPLEMENTATION")
        inputs["review_result_path"] = self.make_result(
            "project-fast-waiver-no-validation",
            "project_fast_policy",
            "PROJECT_FAST",
            status="WAIVED_UNAVAILABLE_RUNTIME",
            extra={
                "review": "WAIVED_UNAVAILABLE_RUNTIME",
                "review_type": "REVIEW_WAIVED_UNAVAILABLE_RUNTIME",
                "runtime_independence_available": False,
                "validations_required_pass": False,
                "known_p0_p1_open": False,
                "product_decision_pending": False,
                "architecture_decision_pending": False,
                "remote_or_destructive_operation_pending": False,
                "workspace_fingerprint": workspace_fingerprint(self.root),
                "checked_at": now_utc(),
            },
        )
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_hybrid_done_requires_both_review_components(self) -> None:
        inputs = self.done_inputs(execution_type="HYBRID")
        inputs["review_result_path"] = self.make_result("hybrid-code-only", "independent_reviewer", "REVIEWING", extra={"review_type": "CODE_REVIEW", "review_components": ["CODE_REVIEW"]})
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)
        inputs["review_result_path"] = self.make_result("hybrid-both", "independent_reviewer", "REVIEWING")
        self.assertEqual(self.done_predicates(inputs)["status"], "PASS")

    def test_story_changed_after_review_pass_fails_done(self) -> None:
        inputs = self.done_inputs()
        self.story_file.write_text(self.story_file.read_text(encoding="utf-8") + "\nchanged after review\n", encoding="utf-8")
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def test_allowed_code_changed_after_final_scope_fails_done(self) -> None:
        code_file = self.root / "src" / "feature.ts"
        code_file.parent.mkdir(parents=True)
        code_file.write_text("export const feature = true;\n", encoding="utf-8")
        scope_entries = [
            {"path": "_bmad-output/implementation-artifacts/1-1-first.md", "category": "DEV_WRITABLE", "justification": "story projection"},
            {"path": "src/feature.ts", "category": "DEV_WRITABLE", "justification": "story implementation code"},
        ]
        inputs = self.done_inputs(scope_entries=scope_entries)
        code_file.write_text("export const feature = false;\n", encoding="utf-8")
        self.assertEqual(self.done_predicates(inputs)["status"], "FAIL")

    def test_story_file_of_another_story_fails_done(self) -> None:
        inputs = self.done_inputs()
        with self.assertRaises(ContractError):
            evaluate_predicates(project_root=self.root, state_path=self.runtime / "state.json", story_file=self.story_dir / "1-2-other.md", ledger_path=self.ledger, **self.context(), **inputs)

    def test_alternative_validation_plan_not_frozen_fails_done(self) -> None:
        inputs = self.done_inputs()
        alternate = self.runtime / "results" / "validation-plan-alternate.json"
        write_bytes_atomic(alternate, inputs["validation_plan_path"].read_bytes())
        inputs["validation_plan_path"] = alternate
        with self.assertRaises(ContractError):
            self.done_predicates(inputs)

    def scope_fixture(self, category: str) -> tuple[dict, Path, Path]:
        directory = self.root / category.lower()
        directory.mkdir(exist_ok=True)
        manifest = self.freeze_fixture("scope-manifest", self.scope_proposal([{"path": directory.relative_to(self.root).as_posix(), "category": category, "prefix": True, "justification": "prefix test"}]), "scope-manifest.json")
        baseline_path = self.capture_baseline(f"{category.lower()}-baseline.json")
        changed = directory / "new.txt"
        changed.write_text("changed\n", encoding="utf-8")
        return load_json(manifest), manifest, baseline_path

    def run_scope_actor(self, category: str, actor: str) -> str:
        manifest, manifest_path, baseline_path = self.scope_fixture(category)
        result = evaluate_scope(self.root, load_json(baseline_path), manifest, actor, manifest_path=manifest_path, snapshot_path=baseline_path, expected=self.context())
        return result["status"]

    def test_dev_prefix_dev_actor_passes(self) -> None:
        self.assertEqual(self.run_scope_actor("DEV_WRITABLE", "DEV"), "PASS")

    def test_dev_prefix_fixer_actor_fails(self) -> None:
        self.assertEqual(self.run_scope_actor("DEV_WRITABLE", "FIXER"), "FAIL")

    def test_fixer_prefix_fixer_actor_passes(self) -> None:
        self.assertEqual(self.run_scope_actor("FIXER_WRITABLE", "FIXER"), "PASS")

    def test_fixer_prefix_dev_actor_fails(self) -> None:
        self.assertEqual(self.run_scope_actor("FIXER_WRITABLE", "DEV"), "FAIL")

    def test_controller_prefix_dev_and_fixer_fail(self) -> None:
        manifest, manifest_path, baseline_path = self.scope_fixture("CONTROLLER_ONLY")
        self.assertEqual(evaluate_scope(self.root, load_json(baseline_path), manifest, "DEV", manifest_path=manifest_path, snapshot_path=baseline_path, expected=self.context())["status"], "FAIL")
        self.assertEqual(evaluate_scope(self.root, load_json(baseline_path), manifest, "FIXER", manifest_path=manifest_path, snapshot_path=baseline_path, expected=self.context())["status"], "FAIL")

    def test_project_fast_scope_allows_story_and_controller_policy_changes(self) -> None:
        code_file = self.root / "src" / "feature.ts"
        code_file.parent.mkdir(parents=True)
        code_file.write_text("before\n", encoding="utf-8")
        controller_file = self.root / "skills" / "leadflow-story-implementation-orchestrator" / "scripts" / "policy.py"
        controller_file.parent.mkdir(parents=True)
        controller_file.write_text("before\n", encoding="utf-8")
        frozen = self.freeze_required(scope_entries=[{"path": "src/feature.ts", "category": "FIXER_WRITABLE", "justification": "story fix"}])
        baseline = self.capture_baseline("project-fast-baseline.json")
        code_file.write_text("after\n", encoding="utf-8")
        controller_file.write_text("after\n", encoding="utf-8")
        result = evaluate_scope(self.root, load_json(baseline), load_json(frozen["scope"]), "PROJECT_FAST", manifest_path=frozen["scope"], snapshot_path=baseline, expected=self.context())
        self.assertEqual(result["status"], "PASS")

    def test_project_fast_scope_rejects_unknown_product_change(self) -> None:
        frozen = self.freeze_required(scope_entries=[{"path": "_bmad-output/implementation-artifacts/1-1-first.md", "category": "DEV_WRITABLE", "justification": "story"}])
        baseline = self.capture_baseline("project-fast-unknown-baseline.json")
        unknown = self.root / "src" / "unknown.ts"
        unknown.parent.mkdir(parents=True)
        unknown.write_text("unknown\n", encoding="utf-8")
        result = evaluate_scope(self.root, load_json(baseline), load_json(frozen["scope"]), "PROJECT_FAST", manifest_path=frozen["scope"], snapshot_path=baseline, expected=self.context())
        self.assertEqual(result["status"], "FAIL")

    def test_workspace_snapshot_ignores_typescript_build_cache(self) -> None:
        (self.root / "tsconfig.tsbuildinfo").write_text("cache\n", encoding="utf-8")
        self.assertNotIn("tsconfig.tsbuildinfo", snapshot_workspace(self.root))

    def test_scope_ignores_typescript_build_cache_from_existing_baseline(self) -> None:
        (self.root / "tsconfig.tsbuildinfo").write_text("cache\n", encoding="utf-8")
        frozen = self.freeze_required(scope_entries=[{"path": "_bmad-output/implementation-artifacts/1-1-first.md", "category": "DEV_WRITABLE", "justification": "story"}])
        baseline = self.capture_baseline("typescript-cache-baseline.json")
        baseline_value = load_json(baseline)
        baseline_value["files"]["tsconfig.tsbuildinfo"] = "0" * 64
        baseline_value["file_map_fingerprint"] = canonical_hash(baseline_value["files"])
        write_json_atomic(baseline, baseline_value)
        registry = load_json(self.runtime / "baseline-snapshots.json")
        registry["snapshots"][baseline_value["snapshot_id"]]["artifact_sha256"] = sha256_file(baseline)
        registry["snapshots"][baseline_value["snapshot_id"]]["file_map_fingerprint"] = baseline_value["file_map_fingerprint"]
        write_json_atomic(self.runtime / "baseline-snapshots.json", registry)
        (self.root / "tsconfig.tsbuildinfo").unlink()
        result = evaluate_scope(self.root, load_json(baseline), load_json(frozen["scope"]), "PROJECT_FAST", manifest_path=frozen["scope"], snapshot_path=baseline, expected=self.context())
        self.assertEqual(result["status"], "PASS")

    def test_operational_scope_rejects_dev_fixer_authorization_before_review(self) -> None:
        code_file = self.root / "src" / "unexpected.ts"
        code_file.parent.mkdir(parents=True)
        code_file.write_text("export const before = true;\n", encoding="utf-8")
        scope_entries = [{"path": "src/unexpected.ts", "category": "DEV_WRITABLE", "justification": "must be rejected for operational"}]
        frozen = self.freeze_required(scope_entries=scope_entries, execution_type="OPERATIONAL")
        baseline = self.capture_baseline("operational-baseline.json")
        code_file.write_text("export const before = false;\n", encoding="utf-8")
        with self.assertRaises(ContractError):
            evaluate_scope(self.root, load_json(baseline), load_json(frozen["scope"]), "DEV", manifest_path=frozen["scope"], snapshot_path=baseline, expected=self.context())

    def test_manifest_self_consistent_but_unregistered_fails(self) -> None:
        manifest, manifest_path, baseline_path = self.scope_fixture("DEV_WRITABLE")
        unregistered = self.runtime / "unregistered-scope-manifest.json"
        write_bytes_atomic(unregistered, manifest_path.read_bytes())
        with self.assertRaises(ContractError):
            evaluate_scope(self.root, load_json(baseline_path), manifest, "DEV", manifest_path=unregistered, snapshot_path=baseline_path, expected=self.context())

    def test_baseline_modified_after_capture_fails(self) -> None:
        manifest_path = self.freeze_fixture("scope-manifest", self.scope_proposal(), "scope-manifest.json")
        baseline_path = self.capture_baseline()
        baseline_path.write_text(baseline_path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        with self.assertRaises(ContractError):
            evaluate_scope(self.root, load_json(baseline_path), load_json(manifest_path), "DEV", manifest_path=manifest_path, snapshot_path=baseline_path, expected=self.context())

    def test_fabricated_baseline_object_fails_even_with_registered_path(self) -> None:
        manifest_path = self.freeze_fixture("scope-manifest", self.scope_proposal(), "scope-manifest.json")
        baseline_path = self.capture_baseline()
        fabricated = load_json(baseline_path)
        fabricated["files"] = {}
        with self.assertRaises(ContractError):
            evaluate_scope(self.root, fabricated, load_json(manifest_path), "DEV", manifest_path=manifest_path, snapshot_path=baseline_path, expected=self.context())

    def test_baseline_other_run_fails(self) -> None:
        manifest_path = self.freeze_fixture("scope-manifest", self.scope_proposal(), "scope-manifest.json")
        baseline_path = self.capture_baseline()
        expected = self.context()
        expected["run_id"] = "OTHER-RUN"
        with self.assertRaises(ContractError):
            evaluate_scope(self.root, load_json(baseline_path), load_json(manifest_path), "DEV", manifest_path=manifest_path, snapshot_path=baseline_path, expected=expected)

    def test_done_success_projects_status_done(self) -> None:
        inputs = self.done_inputs()
        predicates = self.done_predicates(inputs)
        result = apply_done(project_root=self.root, state_path=self.runtime / "state.json", story_file=self.story_file, ledger_path=self.ledger, predicates=predicates)
        self.assertEqual(result["status"], "DONE")
        self.assertIn("Status: done", self.story_file.read_text(encoding="utf-8"))
        self.assertEqual(load_json(self.runtime / "state.json")["stories"][0]["status"], "DONE")
        self.assertTrue(any(item.get("evidence_id") == result["evidence_id"] for item in (json.loads(line) for line in self.ledger.read_text(encoding="utf-8").splitlines() if line)))

    def test_done_intermediate_failure_rolls_back_state_story_and_evidence(self) -> None:
        inputs = self.done_inputs()
        predicates = self.done_predicates(inputs)
        before_state = (self.runtime / "state.json").read_bytes()
        before_story = self.story_file.read_bytes()
        before_ledger = self.ledger.read_bytes()
        with patch.object(done_gate, "project_story_done", side_effect=OSError("injected projection failure")):
            with self.assertRaises(ContractError):
                apply_done(project_root=self.root, state_path=self.runtime / "state.json", story_file=self.story_file, ledger_path=self.ledger, predicates=predicates)
        self.assertEqual((self.runtime / "state.json").read_bytes(), before_state)
        self.assertEqual(self.story_file.read_bytes(), before_story)
        self.assertEqual(self.ledger.read_bytes(), before_ledger)


if __name__ == "__main__":
    unittest.main()
