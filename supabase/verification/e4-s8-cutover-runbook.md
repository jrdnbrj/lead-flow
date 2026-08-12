# E4-S8 Phase B cutover runbook — implementation preparation

This runbook is executable only in a later authorized deployment phase. Current validation proves structure, not runtime success.

1. Verify PASS fingerprints for E4-S1, S2, S3, S4, S5a, S5b, S6 and S7, plus the singleton Auth user and E4-S4 report.
2. Verify target identity is isolated preview and not SOURCE/production. If identity is unknown, stop.
3. Put all listed writers in maintenance/FROZEN or SHARED_LOCK and record `correlation_id`.
4. Acquire transaction advisory lock `leadflow_auth_cutover`; timeout aborts.
5. Recheck dry-run counts and ownership roots.
6. In one transaction, update only `leads.user_id` and `leadflow_settings.user_id` NULL roots to the approved singleton. Do not modify derived ownership or `tenant_id`.
7. Apply only the frozen E4-S7 RLS/grant target. No unlisted permission is allowed.
8. Assert zero NULL/orphan/mismatch, event/audit atomicity, singleton immutability and callback lock behavior.
9. On any failure, rollback, retain maintenance, preserve anonymous-private closure, and record FAIL.
10. Commit only after all assertions pass; retain the lock until writers are safely coordinated.

Runtime result must include correlation ID, pre/post counts, target identity, migration version, assertion results, rollback result and evidence refs. No secrets or private rows are recorded.
