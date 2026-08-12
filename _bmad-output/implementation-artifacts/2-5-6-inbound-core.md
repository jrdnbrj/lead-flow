# E2-S5 / E2-S6 — Núcleo inbound transaccional

Status: IMPLEMENTATION_COMPLETE

## E2-S5

Added the service-role RPC `persist_inbound_message_v1`. It validates the
classification and association contract, locks the active owned lead, dedupes
by `(evolution_instance, provider_message_id)`, persists the safe inbound
message without raw provider payload, and appends `inbound_message_received`
in the same transaction. Ambiguous matches additionally append
`inbound_lead_match_ambiguous`; no-match returns without creating a lead,
message, or invented event type.

## E2-S6

Added `upsert_inbound_response_action_v1`. It locks the owned lead and the
single open `RESPONSE` action, creates or updates it with `source_message_id`,
preserves `scheduled_for` for `POSTPONED`, increments `action_version` for a
new inbound context, and appends `response_action_upserted` before committing.
Idempotency is stored in the existing action command ledger under
`INBOUND_RESPONSE`. Terminal actions are left historical and a new response
action is created for new work.

## Scope and validation

No route orchestration, UI, manual correction, outbound/Epic 3 behavior, Push,
or S7 work was added. Contract checks and typecheck are implementation-level;
remote Supabase, RLS/ownership, webhook delivery, distributed races and real
provider validation remain `DEFERRED_RUNTIME_VALIDATION`.
