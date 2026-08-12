import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/013_evolution_message_composite_identity.sql", "utf8");
const route = fs.readFileSync("app/api/webhooks/evolution/route.ts", "utf8");
const required = [
  migration.includes("evolution_instance text"),
  migration.includes("lead_messages_instance_provider_id_idx"),
  route.includes("EVOLUTION_API_INSTANCE_NAME"),
  route.includes("findLeadMessageByProviderIdForProvider(providerMessageId, EVOLUTION_INSTANCE)"),
  route.includes("evolutionInstance: EVOLUTION_INSTANCE"),
  route.includes("if (!providerMessageId || !EVOLUTION_INSTANCE) return false"),
];
if (required.every(Boolean)) {
  console.log("E4-S6_WEBHOOK_CONTRACT_PASS");
  process.exit(0);
}
console.error("E4-S6_WEBHOOK_CONTRACT_FAIL");
process.exit(1);
