# E4-S10 safe reopen runbook — implementation preparation

Status: `DEFERRED_RUNTIME_VALIDATION`.

1. Verify fresh PASS fingerprints for E4-S1, S4, S7, S8 and S9, health/readiness and the singleton Auth identity.
2. Keep maintenance and writers frozen; assign one correlation ID.
3. Verify `AUTH_REQUIRED=true`, private anonymous policies closed and callbacks locked/retryable.
4. Execute only reversible authenticated probes in an isolated target: login/logout, correct/incorrect/anonymous reads, reversible write, Realtime/fallback, controlled webhook and soft delete/no-rematching.
5. If any precondition fails, record FAIL, keep maintenance and do not relax RLS/grants.
6. Remove maintenance and release writers only after every probe is PASS and the observation window is recorded.
7. If failure occurs after flag verification, keep `AUTH_REQUIRED=true`, maintenance and private closure; use fix-forward/restore, never anonymous rollback.

This document does not execute flags, release writers or contact services.
