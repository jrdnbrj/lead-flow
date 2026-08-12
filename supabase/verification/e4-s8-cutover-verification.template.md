# E4-S8 cutover verification — runtime result template

Status: `DEFERRED_RUNTIME_VALIDATION`

- correlation_id: `<runtime-only>
- target_identity: `<preview-isolated project ref>
- migration_version: `<observed>
- pre_counts: `<metadata only>
- post_counts: `<metadata only>
- null_orphan_mismatch_assertions: `PASS|FAIL|DEFERRED`
- RLS_grants_assertions: `PASS|FAIL|DEFERRED`
- rollback_assertion: `PASS|FAIL|DEFERRED`
- callback_lock_assertion: `PASS|FAIL|DEFERRED`
- event_atomicity_assertion: `PASS|FAIL|DEFERRED`
- evidence_refs: `<runtime evidence refs>`

Never fill this template with invented runtime PASS or private rows.
