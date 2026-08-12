import { readFile } from "node:fs/promises";

const route = await readFile("app/api/webhooks/evolution/route.ts", "utf8");
const actions = await readFile("lib/leads/actions.ts", "utf8");
const migration = await readFile("supabase/migrations/017_epic2_manual_response_correction.sql", "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(route.includes("normalizeInboundPayload") && route.includes("InboundMessageLedger"), "webhook adapter must use DTO and request identity ledger");
assert(route.includes("resolveInboundLeadMatchForProvider") && route.includes("persistInboundMessageForProvider"), "webhook adapter must delegate matching and persistence");
assert(route.includes("upsertInboundResponseActionForProvider") && route.includes("classifyInboundMessage"), "webhook adapter must delegate convergence and classification");
assert(!route.includes("markLeadCustomerReplyForProvider"), "webhook inbound path must not retain direct lead mutation");
assert(!route.includes("createLeadMessageForProvider({ leadId: lead.id, evolutionInstance: EVOLUTION_INSTANCE, providerMessageId, direction: \"INBOUND\""), "webhook must not directly persist governed inbound messages");
assert(route.includes("processOutboundEvent"), "brownfield outbound processing must remain present");
assert(actions.includes("correctInboundResponseAction") && actions.includes("correctInboundResponseSchema"), "manual correction server action missing");
assert(migration.includes("lead_inbound_manual_decisions") && migration.includes("correct_inbound_response_v1"), "manual decision evidence/RPC missing");
assert(migration.includes("REQUIRES_RESPONSE") && migration.includes("NO_RESPONSE_REQUIRED"), "manual decision vocabulary missing");
assert(migration.includes("transition_lead_follow_up_action_v1") && migration.includes("IGNORED"), "manual no-response path must use canonical transition");
console.log("E2-S7/S8 contract checks: PASS");
