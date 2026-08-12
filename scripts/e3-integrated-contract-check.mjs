import fs from "node:fs";
const files = [
  "supabase/migrations/019_epic3_first_contact_model.sql",
  "supabase/migrations/020_epic3_request_and_effects.sql",
  "supabase/migrations/021_epic3_effect_execution.sql",
  "supabase/migrations/022_epic3_retry_and_action_adapter.sql",
  "lib/first-contact/command.ts",
  "lib/first-contact/provider.ts",
  "lib/leads/actions.ts",
  "components/leads/first-contact-summary.tsx",
];
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const token of ["FIRST_CONTACT", "operation_version", "MESSAGE", "PHOTOS", "TECHNICAL_SHEET", "ACCEPTED", "FAILED", "UNKNOWN", "NOT_AVAILABLE", "first_contact_requested", "first_contact_result", "external_effect_claimed", "external_effect_result_recorded", "retry_first_contact_effect_v1", "startFirstContactAction", "retryFirstContactResourceAction"]) if (!source.includes(token)) throw new Error(`missing integrated contract ${token}`);
for (const token of ["configuration_digest", "business_key", "idempotency_key", "claim_token_digest", "resource_results", "lead_message_id"]) if (!source.includes(token)) throw new Error(`missing identity/traceability control ${token}`);
if (/raw_payload|api[_-]?key|secret/i.test(source)) throw new Error("raw provider payload or secret appears in Epic 3 scope");
if (/push|purchase_decision|inbound_classification|scheduler/i.test(source)) throw new Error("scope leakage in Epic 3");
console.log("Epic 3 integrated contract checks: PASS");
