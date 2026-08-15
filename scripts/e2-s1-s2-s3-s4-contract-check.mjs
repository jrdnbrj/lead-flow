import { readFile } from "node:fs/promises";
import { classifyInboundMessage, normalizeInboundText } from "../lib/leads/inbound-classifier.ts";
import { InboundMessageLedger, compareInboundOrder } from "../lib/leads/inbound-dedup.ts";

const dto = await readFile("lib/leads/inbound-dto.ts", "utf8");
const matching = await readFile("lib/leads/inbound-matching.ts", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");
const registry = await readFile("supabase/migrations/011_leadflow_event_registry_and_append.sql", "utf8");
const runtimeFix = await readFile("supabase/migrations/027_e2_provider_message_id_safe_text.sql", "utf8");
const correctionFix = await readFile("supabase/migrations/028_e2_manual_correction_result_qualification.sql", "utf8");

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(normalizeInboundText("  GRACIAS!!!  ") === "gracias", "classifier normalization failed");
assert(classifyInboundMessage("gracias").classification === "NO_SUGGESTION", "allowlist failed");
assert(classifyInboundMessage("👍🏽✅").classification === "NO_SUGGESTION", "emoji allowlist failed");
assert(classifyInboundMessage("¿Cuál es el precio?").classification === "PENDING", "question classification failed");
assert(classifyInboundMessage("gracias 123").classification !== "NO_SUGGESTION", "numbers bypass allowlist");
assert(classifyInboundMessage("mira esto https://example.com").classification !== "NO_SUGGESTION", "URL bypass allowlist");
assert(classifyInboundMessage("tal vez").classification === "REVIEW", "ambiguous classification failed");
assert(JSON.stringify(classifyInboundMessage("¿Cuál es el precio?")) === JSON.stringify(classifyInboundMessage("¿Cuál es el precio?")), "classifier is not deterministic");

for (const token of ["providerMessageId", "evolutionInstance", "remoteJidAlt", "timestamp", "direction", "UNSUPPORTED_EVENT", "MISSING_PROVIDER_MESSAGE_ID", "NOT_INBOUND"]) assert(dto.includes(token), `DTO contract missing ${token}`);
for (const token of ["formatPhoneForWhatsapp", "deletedAt", "createdAt", "AMBIGUOUS", "NO_MATCH", "localeCompare"]) assert(matching.includes(token), `matching contract missing ${token}`);
assert(repository.includes("resolveInboundLeadMatchForProvider"), "repository does not expose deterministic provider matching");
assert(registry.indexOf("when key_name like '%_id'") < registry.indexOf("when key_name in ('review_label','provider_message_id') then 'safe_text'") , "historical registry migration must retain its deployed ordering");
assert(runtimeFix.includes("update public.leadflow_event_registry") && runtimeFix.includes("{types,provider_message_id}") && runtimeFix.includes("safe_text"), "runtime registry reconciliation missing");
assert(correctionFix.includes("select d.result") && correctionFix.includes("as d"), "manual correction result qualification missing");

const ledger = new InboundMessageLedger();
assert(ledger.accept({ evolutionInstance: "sales", providerMessageId: "m-1" }).accepted, "first identity rejected");
assert(ledger.accept({ evolutionInstance: "sales", providerMessageId: "m-1" }).replay, "replay not detected");
assert(ledger.accept({ evolutionInstance: "other", providerMessageId: "m-1" }).accepted, "cross-instance identity collided");
assert(ledger.accept({ evolutionInstance: "", providerMessageId: "m-2" }).reason === "INVALID_IDENTITY", "invalid identity mutated ledger");
assert(compareInboundOrder({ evolutionInstance: "sales", providerMessageId: "a", timestamp: "2026-01-01T00:00:00.000Z" }, { evolutionInstance: "sales", providerMessageId: "b", timestamp: "2026-01-01T00:00:00.000Z" }) < 0, "order tie-break failed");

console.log("E2-S1/S2/S3/S4 contract check: PASS");
