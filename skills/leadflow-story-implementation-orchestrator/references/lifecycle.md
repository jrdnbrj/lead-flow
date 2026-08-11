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

If the runtime cannot provide an independent reviewer, `REVIEWING → AWAITING_EXTERNAL_REVIEW → REVIEWING` uses one controller-owned request and one structured result. Runtime unavailability is not `NEEDS_USER_DECISION`. A passing review may enter `CANDIDATE_DONE`, or `done_gate.py` may perform equivalent atomic completion directly from `REVIEWING`; the same validation, review, final-scope, provenance and current-filesystem predicates remain mandatory. `NEEDS_USER_DECISION` and `ESCALATED` are terminal unless controller-only integrity recovery explicitly reopens an integrity block without changing generation or repair round.

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
AWAITING_EXTERNAL_REVIEW
NEEDS_TECHNICAL_FIX
REVALIDATING
CANDIDATE_DONE
DONE
NEEDS_USER_DECISION
ESCALATED
```
