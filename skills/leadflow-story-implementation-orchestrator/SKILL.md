---
name: leadflow-story-implementation-orchestrator
description: 'Orchestrates bounded LeadFlow story implementation. Use when the user says "run story implementation" or "process the next READY_FOR_DEV story".'
---

# LeadFlow Story Implementation Orchestrator

Automate the bounded transition from a valid readiness handoff to a fully evidenced `DONE` result. The consumer is the repository and its delivery owner: every terminal result must be reproducible from frozen contracts, validation evidence, review findings, and scope checks.

This workflow is separate from `leadflow-story-readiness-orchestrator`. Readiness runtime is an immutable handoff authority; this workflow owns only implementation state under `_bmad-output/orchestration/leadflow-story-implementation/`.

## Non-negotiable boundary

LLM work may propose semantic artifacts and code changes. Scripts enforce structure and policy after proposals are written. Never call semantic inference “deterministic”. The proposal/freeze boundary is:

```text
LLM proposal → schema/source/path validation → frozen artifact + fingerprint → execution
```

The LLM, DEV, fixer, and reviewer cannot edit frozen `story_execution_type.json`, `validation-plan.json`, or `scope-manifest.json`. Each frozen artifact is registered with its file SHA-256, story/run context, generation, and embedded fingerprint; any change or unregistered copy restarts or blocks the corresponding gate.

## Run contract

1. Require one explicit story ID. Never use BMad autodiscovery.
2. Verify the readiness runtime, its PASS evidence, invalidation status, dependency fingerprints, and story-content fingerprint before reading BMad `Status` as a projection.
3. Reconcile a secondary BMad status drift automatically when content and fingerprints still agree. Escalate material divergence.
4. Obtain and freeze `story-execution-type`, `validation-plan`, and `scope-manifest` before implementation or external evidence collection; register the controller-owned baseline snapshot before scope evaluation.
5. Execute only the lifecycle required by the frozen type: `IMPLEMENTATION`, `OPERATIONAL`, or `HYBRID`.
6. Keep DEV, fixer, and reviewer in separate workspaces/contexts. Reviewer and validation results must carry the workspace fingerprint and check timestamp they actually inspected. Import only structured results.
7. Register `external-evidence-request.json` with `register_external_evidence.py` before `AWAITING_EXTERNAL_EVIDENCE`; `import_external_evidence.py` accepts only the intact registered request. Supplied evidence is never PASS until validated and reviewed.
8. Enforce canonical paths, registered baseline snapshots, forbidden categories, secret redaction, dependency completion, required validations, ledger-bound result provenance, final workspace scope, bounded fix rounds, and the `DONE` gate with scripts.

## Required scripts

Use `uv run scripts/<script>.py --help` for the current interface. The scripts are stdlib-only and return JSON on stdout with exit code `0` for PASS, `1` for a contract/policy failure, and `2` for an execution error.

- `freeze_artifact.py`: validates proposal artifacts and writes their frozen counterparts.
- `handoff_gate.py` and `reconcile_bmad_projection.py`: verify readiness authority and repair only a secondary BMad `Status` projection.
- `dependency_gate.py`: requires every implementation dependency to be `DONE`.
- `capture_snapshot.py` and `scope_gate.py`: protect pre-existing dirty files with content hashes and enforce the frozen manifest.
- `register_external_evidence.py`: registers the controller-owned request file, hash, context, and fingerprint before external evidence is requested.
- `validation_gate.py`: consumes only the registered frozen story-specific validation plan; missing REQUIRED checks fail.
- `import_external_evidence.py`: validates the intact registered request and redacts structured external evidence without executing the operation.
- `record_transition.py`: writes allowed non-terminal story transitions; it cannot write `DONE`.
- `done_gate.py`: the sole controller script allowed to project `DONE` and BMad `Status: done`; it verifies frozen-artifact/result provenance, rechecks the registered story and current workspace, requires a ledger-bound `FINAL_SCOPE_GATE`, and compensates state, evidence, and projection writes on failure.

## Lifecycle routing

Load `references/lifecycle.md` for state transitions, `references/proposal-and-freeze.md` for semantic proposal boundaries, `references/external-evidence.md` for operational contracts, `references/path-policy.md` for real canonical path enforcement, and `references/pilot-policy.md` for E4-S1 and E4-S2. Do not execute a pilot merely by reading these references.

## Safety envelope

No automatic backup/restore, Supabase remote mutation, migration push, secret handling, external provider send, destructive command, or production operation. Unknown external outcomes escalate. A failed REQUIRED check, open P0/P1/P2 finding, scope drift, invalid readiness handoff, missing dependency, stale evidence, or unredacted sensitive data cannot reach `DONE`.
