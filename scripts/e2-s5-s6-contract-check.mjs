import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/016_epic2_inbound_persistence_and_response.sql", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");
const database = await readFile("lib/supabase/database.ts", "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const s5 = migration.slice(migration.indexOf("create or replace function public.persist_inbound_message_v1"), migration.indexOf("create or replace function public.upsert_inbound_response_action_v1"));

for (const token of [
  "persist_inbound_message_v1", "leadflow_require_event_append_v1", "inbound_message_received",
  "inbound_lead_match_ambiguous", "evolution_instance", "provider_message_id", "raw_payload)",
  "upsert_inbound_response_action_v1", "response_action_upserted", "source_message_id",
  "action_type = 'RESPONSE'", "status in ('PENDING', 'POSTPONED')", "prior_action.scheduled_for",
  "action_version = prior_action.action_version + 1", "INBOUND_RESPONSE",
]) assert(migration.includes(token), `migration contract missing ${token}`);

assert(s5.indexOf("insert into public.lead_messages") < s5.indexOf("inbound_message_received"), "message is not persisted before its event");
assert(migration.includes("return jsonb_build_object('status', 'REPLAYED'"), "inbound replay result missing");
assert(migration.includes("p_classification not in ('PENDING', 'REVIEW')"), "response classification guard missing");
assert(migration.includes("p_classification not in ('NO_SUGGESTION', 'PENDING', 'REVIEW')"), "inbound classification guard missing");
assert(!migration.includes("raw_payload, p_"), "raw provider payload is written by S5");
assert(repository.includes("persistInboundMessageForProvider") && repository.includes("upsertInboundResponseActionForProvider"), "repository adapters missing");
assert(database.includes("persist_inbound_message_v1") && database.includes("upsert_inbound_response_action_v1"), "database function types missing");
assert(!repository.includes("processIncomingMessage"), "S7 route orchestration leaked into repository");

console.log("E2-S5/S6 contract check: PASS");
