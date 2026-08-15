import fs from "node:fs";

const files = [
  "supabase/migrations/020_epic3_request_and_effects.sql",
  "supabase/migrations/021_epic3_effect_execution.sql",
  "supabase/migrations/029_e3_external_effect_owner_fix.sql",
  "lib/first-contact/command.ts",
  "lib/first-contact/provider.ts",
  "lib/leads/repository.ts",
];
for (const file of files) if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
const sql = files.slice(0, 2).map((file) => fs.readFileSync(file, "utf8")).join("\n");
const ownerFix = fs.readFileSync("supabase/migrations/029_e3_external_effect_owner_fix.sql", "utf8");
for (const token of [
  "request_first_contact_v1",
  "first_contact_requested",
  "claim_first_contact_effect_v1",
  "begin_first_contact_effect_io_v1",
  "record_first_contact_effect_result_v1",
  "external_effect_claimed",
  "external_effect_io_started",
  "external_effect_result_recorded",
  "first_contact_result",
  "ACCEPTED",
  "FAILED",
  "UNKNOWN",
  "NOT_AVAILABLE",
  "lead_message_id",
]) if (!sql.includes(token)) throw new Error(`missing contract ${token}`);
const command = fs.readFileSync("lib/first-contact/command.ts", "utf8");
for (const token of ["requestFirstContact", "claimFirstContactEffect", "beginFirstContactEffect", "recordFirstContactEffectResult", "retryableFirstContactResult"]) if (!command.includes(token)) throw new Error(`missing adapter ${token}`);
const provider = fs.readFileSync("lib/first-contact/provider.ts", "utf8");
if (!provider.includes("createFakeFirstContactProvider") || !provider.includes("UNKNOWN")) throw new Error("fake provider/error mapping missing");
if (!ownerFix.includes("insert into public.external_effects (user_id, lead_id") || !ownerFix.includes("values (owner_id, p_lead_id")) throw new Error("external effect owner propagation fix missing");
if (/raw_payload|api[_-]?key|secret/i.test(sql)) throw new Error("provider payload or secret persisted in E3 contract");
if (/push|purchase_decision|inbound_classification/i.test(sql + command)) throw new Error("scope leakage in E3 batch 2");
console.log("E3 batch 2 contract checks: PASS");
