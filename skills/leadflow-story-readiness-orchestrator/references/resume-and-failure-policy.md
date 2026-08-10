# Resume and fail-closed policy

Every operation carries an idempotent operation ID and advances `state_revision`. Resume validates state and ledgers, reconciles incomplete operations, checks story/source/dependency fingerprints, and continues from the incomplete gate. A previous PASS is not repeated when its inputs are unchanged.

Missing state, invalid schema, missing artifacts, contradictory evidence, changed story contents, changed authoritative inputs, or a dependency that is no longer `READY_FOR_DEV` prevents readiness. A ready story becomes `NEEDS_REVALIDATION`, and invalidation propagates to all descendants of the dependency graph in deterministic rank order.

`ready_gate.py` may change only the existing BMad `Status` field as a controlled projection. It records the validation hash, final hash, exact field transition, and evidence reference. Resume accepts that one recorded `Status` transition as the expected hash update; a different change, or a change without the matching projection record, is invalidated fail-closed.
