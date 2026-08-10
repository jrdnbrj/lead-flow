---
name: leadflow-story-readiness-orchestrator
description: Orchestrate conservative LeadFlow story readiness. Use when the user asks to validate existing stories through READY_FOR_DEV.
---

# LeadFlow Story Readiness Orchestrator

Act as a conservative workflow coordinator. The outcome is a verifiable readiness decision for an existing story in `{project-root}/_bmad-output/implementation-artifacts/`; the consumer is the later development workflow, so only the deterministic gate may write `READY_FOR_DEV`.

This workflow covers story validation, triage, bounded technical repair, revalidation, decision requests, dependency propagation, and evidence. It does not create stories, implement code, run DEV, run ATDD, run code review, deploy, push Git, or modify secrets. It has no agent personality and no relational memory. Runtime state lives only in the orchestration artifacts described below.

## Resolution rules

- Bare paths resolve from this skill root.
- `{project-root}` is the LeadFlow repository.
- Runtime artifacts live at `{project-root}/_bmad-output/orchestration/leadflow-story-readiness/`.

## Activation

1. Load `{project-root}/_bmad-output/project-context.md`, the active planning sources, and the existing implementation stories.
2. Run `uv run scripts/resume_reconcile.py` before selecting work. Missing or invalid state fails closed.
3. Run `uv run scripts/select_story.py`. For the pilot, pass `--story E4-S5b --stop-after-terminal`; never process another story implicitly.
4. Create review context with `uv run scripts/prepare_context.py`. The validator receives the current story, the manifest's authoritative inputs, approved decisions, and review criteria. Revalidation receives only the current story, the same authoritative inputs, and objective blocker closure criteria.
5. Let the LLM parent classify findings. Scripts apply only schema-valid transitions. A technical repair must be a structured patch targeting the current story; route any product, scope, upstream, other-story, or code change to a pending decision or escalation.
6. Append evidence for every gate. `PRODUCT_DECISION` is forbidden in the decision ledger until the user explicitly answers a `pending-decision.json` request.
7. Run `uv run scripts/ready_gate.py` only after a PASS from `VALIDATE`, `TRIAGE`, `REVALIDATING`, or `FINAL_REVALIDATION`. The script requires a real PASS evidence entry linked from both the story and `last_result`, with the exact story, gate, iteration, and pre-gate timestamp. It checks dependencies, current story and source fingerprints, blockers, decision flags, and loop limits before writing `READY_FOR_DEV`.

## Allowed workflow states

`PENDING`, `VALIDATING`, `NEEDS_TECHNICAL_FIX`, `NEEDS_USER_DECISION`, `REVALIDATING`, `NEEDS_REVALIDATION`, `READY_FOR_DEV`, and `ESCALATED` are the only story states. The normal review limit is two rounds, followed by at most one full audit, one consolidated repair, and one final revalidation.

## Authority and independence

Use active explicit decisions, PRD, Architecture Spine, UX, epic/story scope, project-context, then relevant brownfield behavior. Equal-authority conflicts escalate. The corrector never edits those upstream artifacts. The reviewer and revalidator never receive repair defenses, parent reasoning, or prior conclusions; revalidation receives only objective blocker IDs and closure criteria.

## Runtime contract

`state.json`, `decision-ledger.jsonl`, and `evidence-ledger.jsonl` are append/transition-controlled artifacts. Do not edit them by hand. `apply_story_patch.py` is the only repair writer and accepts one exact story file, an expected fingerprint, a structured patch, and a saved diff. `ready_gate.py` is the only writer of the terminal readiness state and the only component allowed to project BMad `Status` to `ready-for-dev`.

The story fingerprint is the hash of the raw story file. A readiness PASS first validates `old_hash`; `ready_gate.py` then performs one controlled `Status`-only transition `old_hash -> final_hash`, records both hashes and the projection evidence, and stores `final_hash` as the active fingerprint. Resume ignores that exact recorded transition once; any other content change invalidates readiness.

The status projection is fail-safe: story content, evidence ledger/index, and state are committed with compensating atomic rollback. A persistence failure restores the original story, ledger/index snapshots, and state; the transition is reported as failed and is not considered READY.

Known non-blocking debt: `apply_story_patch.py` currently compares dirty paths and the target story fingerprint, but does not fingerprint every already-dirty file. The workflow is single-run and non-concurrent for V1; this must be hardened before autonomous parallel execution.

When no story is eligible, report every unsatisfied dependency and stop. After the pilot reaches `READY_FOR_DEV`, `NEEDS_USER_DECISION`, or `ESCALATED`, return the observable summary and stop.
