# Lifecycle and state contract

`READY_FOR_DEV` is imported from the readiness runtime. It is not written by this workflow.

Common handoff:

```text
READY_FOR_DEV → HANDOFF_VERIFYING → READY_FOR_IMPLEMENTATION → SCOPE_LOCKED
```

Projection-only drift enters `RECONCILIATION_REQUIRED`; material content, fingerprint, invalidation, or PASS-evidence divergence enters `ESCALATED`.

`IMPLEMENTATION`:

```text
SCOPE_LOCKED → IMPLEMENTING → VALIDATING → REVIEWING
```

`OPERATIONAL`:

```text
SCOPE_LOCKED → AWAITING_EXTERNAL_EVIDENCE → VALIDATING_EVIDENCE → REVIEWING
```

`HYBRID` runs both gates, in that order in V1:

```text
SCOPE_LOCKED → IMPLEMENTING → VALIDATING → AWAITING_EXTERNAL_EVIDENCE → VALIDATING_EVIDENCE → REVIEWING
```

Review repairs use at most two cycles:

```text
REVIEWING → NEEDS_TECHNICAL_FIX → REVALIDATING → REVIEWING
```

Only a passing review can enter `CANDIDATE_DONE`; validation and review results must carry the workspace fingerprint and check timestamp they inspected. Before `done_gate.py` can enter `DONE`, those fingerprints must match a fresh ledger-bound `FINAL_SCOPE_GATE` and the current filesystem. `NEEDS_USER_DECISION` and `ESCALATED` are terminal for the current run.

Allowed story states:

```text
PENDING
HANDOFF_VERIFYING
RECONCILIATION_REQUIRED
READY_FOR_IMPLEMENTATION
SCOPE_LOCKED
IMPLEMENTING
VALIDATING
AWAITING_EXTERNAL_EVIDENCE
VALIDATING_EVIDENCE
REVIEWING
NEEDS_TECHNICAL_FIX
REVALIDATING
CANDIDATE_DONE
DONE
NEEDS_USER_DECISION
ESCALATED
```
