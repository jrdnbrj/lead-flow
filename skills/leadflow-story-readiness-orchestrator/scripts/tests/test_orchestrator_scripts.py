#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# ///

from __future__ import annotations

import json
import io
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from bootstrap_state import build_state  # noqa: E402
from lib import atomic_write_json, append_jsonl, default_runtime, require_valid_state, sha256_file, validate_state  # noqa: E402
import ready_gate  # noqa: E402
from resume_reconcile import reconcile  # noqa: E402


class OrchestratorScriptsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.story_dir = self.root / "_bmad-output" / "implementation-artifacts"
        self.story_dir.mkdir(parents=True)
        self.source = self.root / "docs" / "source.md"
        self.evidence = self.root / "docs" / "evidence.md"
        self.source.parent.mkdir(parents=True)
        self.source.write_text("authoritative source\n", encoding="utf-8")
        self.evidence.write_text("validation reference\n", encoding="utf-8")
        self.write_story("1-1-first.md", "1.1", "First", "")
        self.write_story("1-2-second.md", "1.2", "Second", "- E1-S1: first")
        self.write_story("1-3-third.md", "1.3", "Third", "- E1-S2: second")
        self.runtime = default_runtime(self.root)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_story(self, filename: str, number: str, title: str, dependencies: str) -> None:
        content = f"# Story {number}: {title}\n\nStatus: ready-for-dev\n\n## Dependencies\n\n{dependencies}\n\n## Acceptance Criteria\n\n1. It is testable.\n"
        path = self.story_dir / filename
        path.write_text(content, encoding="utf-8")

    def baseline(self, story_ids: list[str]) -> dict:
        return {
            "schema_version": "1.0",
            "import_id": "TEST-BASELINE-001",
            "origin": "MANUAL_BASELINE_IMPORT",
            "approved_by": "Test User",
            "approved_at": "2026-08-10T00:00:00Z",
            "stories": [
                {
                    "story_id": story_id,
                    "status": "READY_FOR_DEV",
                    "evidence_refs": ["docs/evidence.md#PASS"],
                    "source_refs": ["docs/source.md#rule"],
                    "dependencies_checked": True,
                }
                for story_id in story_ids
            ],
        }

    def write_state_with_baseline(self, story_ids: list[str]) -> dict:
        state, evidence_entries = build_state(self.root, self.runtime, "E1", self.baseline(story_ids), "_bmad-output/implementation-artifacts")
        atomic_write_json(self.runtime / "state.json", state)
        for entry in evidence_entries:
            append_jsonl(self.runtime / "evidence-ledger.jsonl", entry)
        return state

    def validation_evidence(
        self,
        evidence_id: str = "EV-VALIDATE-E1-S1-001",
        final_verdict: str = "PASS",
        gate: str = "VALIDATE",
        iteration: int = 1,
    ) -> dict:
        return {
            "evidence_id": evidence_id,
            "story": "E1-S1",
            "gate": gate,
            "iteration": iteration,
            "input_artifact": "_bmad-output/implementation-artifacts/1-1-first.md",
            "reviewer_result": "fixture-review-result.json",
            "blockers": [],
            "resolution": [],
            "timestamp": "2020-01-01T00:00:01Z",
            "final_verdict": final_verdict,
        }

    def prepare_ready_candidate(
        self,
        evidence_entry: dict,
        result_gate: str = "VALIDATE",
        result_verdict: str = "PASS",
        additional_evidence: list[dict] | None = None,
    ) -> None:
        state = self.write_state_with_baseline(["E1-S1"])
        path = self.story_dir / "1-1-first.md"
        content = path.read_text(encoding="utf-8").replace("Status: ready-for-dev", "Status: ready-for-revalidation")
        path.write_text(content, encoding="utf-8")
        story = state["stories"][0]
        story.update({
            "status": "VALIDATING",
            "current_gate": result_gate,
            "review_round": 1,
            "last_result": {
                "gate": result_gate,
                "verdict": result_verdict,
                "iteration": evidence_entry["iteration"],
                "timestamp": "2020-01-01T00:00:00Z",
                "evidence_refs": [evidence_entry["evidence_id"]],
            },
            "blockers_open": [],
            "evidence_refs": [evidence_entry["evidence_id"]],
            "fingerprint": {
                "algorithm": "sha256",
                "value": sha256_file(path),
                "captured_at": "2020-01-01T00:00:00Z",
            },
        })
        if additional_evidence:
            story["evidence_refs"] = [
                *[entry["evidence_id"] for entry in additional_evidence],
                evidence_entry["evidence_id"],
            ]
        atomic_write_json(self.runtime / "state.json", state)
        for entry in [*(additional_evidence or []), evidence_entry]:
            append_jsonl(self.runtime / "evidence-ledger.jsonl", entry)

    def run_ready_gate_in_process(self, atomic_writer) -> tuple[int, str]:
        stderr = io.StringIO()
        argv = [
            "ready_gate.py",
            "--project-root", str(self.root),
            "--runtime", str(self.runtime),
            "--story-id", "E1-S1",
        ]
        with patch.object(sys, "argv", argv), patch.object(ready_gate, "atomic_write_text", side_effect=atomic_writer):
            with redirect_stderr(stderr):
                code = ready_gate.main()
        return code, stderr.getvalue()

    def run_script(self, name: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT_DIR / name), "--project-root", str(self.root), *args],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_bootstrap_requires_dependency_closure(self) -> None:
        with self.assertRaises(ValueError):
            build_state(self.root, self.runtime, "E1", self.baseline(["E1-S2"]), "_bmad-output/implementation-artifacts")

    def test_upstream_source_change_invalidates_descendants(self) -> None:
        self.write_state_with_baseline(["E1-S1", "E1-S2"])
        self.source.write_text("changed authoritative source\n", encoding="utf-8")
        result = reconcile(self.root, self.runtime)
        self.assertEqual([item["story_id"] for item in result["invalidated"]], ["E1-S1", "E1-S2"])
        state = json.loads((self.runtime / "state.json").read_text(encoding="utf-8"))
        statuses = {story["story_id"]: story["status"] for story in state["stories"]}
        self.assertEqual(statuses["E1-S1"], "NEEDS_REVALIDATION")
        self.assertEqual(statuses["E1-S2"], "NEEDS_REVALIDATION")

    def test_pending_decision_does_not_write_product_decision(self) -> None:
        # The helper creates all stories as PENDING when the baseline is empty is forbidden,
        # so use a fresh state with no imported stories from the same builder output.
        state, _ = build_state(self.root, self.runtime, "E1", {
            "schema_version": "1.0", "import_id": "EMPTY-001", "origin": "MANUAL_BASELINE_IMPORT",
            "approved_by": "Test User", "approved_at": "2026-08-10T00:00:00Z", "stories": [
                {"story_id": "E1-S1", "status": "READY_FOR_DEV", "evidence_refs": ["docs/evidence.md"], "source_refs": ["docs/source.md"], "dependencies_checked": True}
            ]
        }, "_bmad-output/implementation-artifacts")
        state["stories"][0]["status"] = "PENDING"
        state["stories"][0]["last_result"] = None
        state["stories"][0]["evidence_refs"] = []
        atomic_write_json(self.runtime / "state.json", state)
        request = self.root / "request.json"
        request.write_text(json.dumps({
            "request_id": "REQ-001", "story_id": "E1-S1", "category": "PRODUCT_DECISION",
            "problem": "Two product behaviors are possible.", "evidence": ["docs/evidence.md"],
            "recommendation": "Choose one explicitly.", "alternatives": ["A", "B"],
            "artifacts_affected": ["story"], "question": "Which behavior is approved?"
        }), encoding="utf-8")
        result = self.run_script("create_pending_decision.py", "--request", str(request))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.runtime / "decision-ledger.jsonl").exists())
        updated = json.loads((self.runtime / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(updated["stories"][0]["status"], "NEEDS_USER_DECISION")

    def test_story_patch_requires_exact_target_and_updates_fingerprint(self) -> None:
        state, _ = build_state(self.root, self.runtime, "E1", {
            "schema_version": "1.0", "import_id": "PATCH-001", "origin": "MANUAL_BASELINE_IMPORT",
            "approved_by": "Test User", "approved_at": "2026-08-10T00:00:00Z", "stories": [
                {"story_id": "E1-S1", "status": "READY_FOR_DEV", "evidence_refs": ["docs/evidence.md"], "source_refs": ["docs/source.md"], "dependencies_checked": True}
            ]
        }, "_bmad-output/implementation-artifacts")
        state["stories"][0]["status"] = "NEEDS_TECHNICAL_FIX"
        state["stories"][0]["last_result"] = {
            "gate": "VALIDATE", "verdict": "FAIL", "iteration": 1,
            "evidence_refs": [], "timestamp": "2020-01-01T00:00:00Z",
        }
        atomic_write_json(self.runtime / "state.json", state)
        path = self.story_dir / "1-1-first.md"
        before_hash = sha256_file(path)
        patch = self.root / "patch.json"
        patch.write_text(json.dumps({
            "schema_version": "1.0", "story_id": "E1-S1",
            "target_story_file": "_bmad-output/implementation-artifacts/1-1-first.md",
            "expected_fingerprint": before_hash,
            "changes": [{"old_text": "1. It is testable.", "new_text": "1. It is deterministically testable."}]
        }), encoding="utf-8")
        result = self.run_script("apply_story_patch.py", "--runtime", str(self.runtime), "--story-id", "E1-S1", "--patch", str(patch))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotEqual(before_hash, sha256_file(path))
        self.assertTrue((self.runtime / "runs" / "E1-S1" / "diffs" / "repair-001.patch").exists())

    def test_story_patch_cannot_project_bmad_status(self) -> None:
        self.write_state_with_baseline(["E1-S1"])
        path = self.story_dir / "1-1-first.md"
        before_hash = sha256_file(path)
        patch = self.root / "status-patch.json"
        patch.write_text(json.dumps({
            "schema_version": "1.0", "story_id": "E1-S1",
            "target_story_file": "_bmad-output/implementation-artifacts/1-1-first.md",
            "expected_fingerprint": before_hash,
            "changes": [{"old_text": "Status: ready-for-dev", "new_text": "Status: ready-for-revalidation"}],
        }), encoding="utf-8")
        result = self.run_script("apply_story_patch.py", "--runtime", str(self.runtime), "--story-id", "E1-S1", "--patch", str(patch))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Status", result.stderr)
        self.assertEqual(before_hash, sha256_file(path))

    def test_ready_gate_rejects_empty_evidence_refs(self) -> None:
        evidence = self.validation_evidence()
        self.prepare_ready_candidate(evidence)
        state = json.loads((self.runtime / "state.json").read_text(encoding="utf-8"))
        state["stories"][0]["evidence_refs"] = []
        atomic_write_json(self.runtime / "state.json", state)
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence", result.stderr)

    def test_ready_gate_rejects_fail_evidence(self) -> None:
        evidence = self.validation_evidence(final_verdict="FAIL")
        self.prepare_ready_candidate(evidence)
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence", result.stderr)

    def test_ready_gate_rejects_evidence_from_other_story(self) -> None:
        evidence = self.validation_evidence()
        evidence["story"] = "E1-S2"
        self.prepare_ready_candidate(evidence)
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence", result.stderr)

    def test_ready_gate_rejects_evidence_from_other_gate(self) -> None:
        evidence = self.validation_evidence()
        evidence["gate"] = "TRIAGE"
        self.prepare_ready_candidate(evidence)
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence", result.stderr)

    def test_ready_gate_accepts_triage_pass_after_validate_pass(self) -> None:
        validate_evidence = self.validation_evidence()
        triage_evidence = self.validation_evidence(
            evidence_id="EV-TRIAGE-E1-S1-001",
            gate="TRIAGE",
        )
        self.prepare_ready_candidate(
            triage_evidence,
            result_gate="TRIAGE",
            additional_evidence=[validate_evidence],
        )
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_ready_gate_rejects_triage_fail(self) -> None:
        triage_evidence = self.validation_evidence(
            evidence_id="EV-TRIAGE-E1-S1-FAIL-001",
            final_verdict="FAIL",
            gate="TRIAGE",
        )
        self.prepare_ready_candidate(triage_evidence, result_gate="TRIAGE", result_verdict="FAIL")
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("valid PASS", result.stderr)

    def test_ready_gate_accepts_correct_pass_and_syncs_status(self) -> None:
        evidence = self.validation_evidence()
        self.prepare_ready_candidate(evidence)
        path = self.story_dir / "1-1-first.md"
        before_hash = sha256_file(path)
        result = self.run_script("ready_gate.py", "--runtime", str(self.runtime), "--story-id", "E1-S1")
        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads((self.runtime / "state.json").read_text(encoding="utf-8"))
        story = state["stories"][0]
        after_hash = sha256_file(path)
        self.assertEqual(story["status"], "READY_FOR_DEV")
        self.assertIn("Status: ready-for-dev", path.read_text(encoding="utf-8"))
        self.assertNotEqual(before_hash, after_hash)
        self.assertEqual(story["fingerprint"]["value"], after_hash)
        self.assertEqual(story["validation_fingerprint"]["value"], before_hash)
        self.assertEqual(story["status_projection"]["validated_hash"], before_hash)
        self.assertEqual(story["status_projection"]["final_hash"], after_hash)
        self.assertIn(story["status_projection"]["evidence_ref"], story["evidence_refs"])
        self.assertEqual(reconcile(self.root, self.runtime)["invalidated"], [])

    def test_ready_gate_rolls_back_story_when_evidence_write_fails(self) -> None:
        evidence = self.validation_evidence()
        self.prepare_ready_candidate(evidence)
        story_path = self.story_dir / "1-1-first.md"
        evidence_path = self.runtime / "evidence-ledger.jsonl"
        state_path = self.runtime / "state.json"
        story_before = story_path.read_text(encoding="utf-8")
        evidence_before = evidence_path.read_text(encoding="utf-8")
        state_before = state_path.read_text(encoding="utf-8")
        original_writer = ready_gate.atomic_write_text
        failed = False

        def fail_evidence_once(path: Path, content: str) -> None:
            nonlocal failed
            if path.resolve() == evidence_path.resolve() and not failed:
                failed = True
                raise OSError("injected evidence write failure")
            original_writer(path, content)

        code, stderr = self.run_ready_gate_in_process(fail_evidence_once)
        self.assertNotEqual(code, 0)
        self.assertIn("rolled back", stderr)
        self.assertEqual(story_path.read_text(encoding="utf-8"), story_before)
        self.assertEqual(evidence_path.read_text(encoding="utf-8"), evidence_before)
        self.assertEqual(state_path.read_text(encoding="utf-8"), state_before)
        self.assertNotEqual(json.loads(state_before)["stories"][0]["status"], "READY_FOR_DEV")

    def test_ready_gate_rolls_back_after_state_write_fails(self) -> None:
        evidence = self.validation_evidence()
        self.prepare_ready_candidate(evidence)
        story_path = self.story_dir / "1-1-first.md"
        evidence_path = self.runtime / "evidence-ledger.jsonl"
        state_path = self.runtime / "state.json"
        index_path = self.runtime / "evidence-index.json"
        story_before = story_path.read_text(encoding="utf-8")
        evidence_before = evidence_path.read_text(encoding="utf-8")
        state_before = state_path.read_text(encoding="utf-8")
        original_writer = ready_gate.atomic_write_text
        failed = False

        def fail_state_once(path: Path, content: str) -> None:
            nonlocal failed
            if path.resolve() == state_path.resolve() and not failed:
                failed = True
                raise OSError("injected state write failure")
            original_writer(path, content)

        code, stderr = self.run_ready_gate_in_process(fail_state_once)
        self.assertNotEqual(code, 0)
        self.assertIn("rolled back", stderr)
        self.assertEqual(story_path.read_text(encoding="utf-8"), story_before)
        self.assertEqual(evidence_path.read_text(encoding="utf-8"), evidence_before)
        self.assertEqual(state_path.read_text(encoding="utf-8"), state_before)
        self.assertFalse(index_path.exists())
        self.assertNotIn("ready-for-dev", story_path.read_text(encoding="utf-8"))

    def test_current_gate_arbitrary_fails_schema_validation(self) -> None:
        state = self.write_state_with_baseline(["E1-S1"])
        state["stories"][0]["current_gate"] = "INVENTED_GATE"
        errors = validate_state(state, self.root)
        self.assertTrue(any("current_gate" in error for error in errors))
        atomic_write_json(self.runtime / "state.json", state)
        with self.assertRaises(ValueError):
            require_valid_state(self.runtime / "state.json", self.root)


if __name__ == "__main__":
    unittest.main()
