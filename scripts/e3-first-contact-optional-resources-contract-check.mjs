import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const plan = read("lib/first-contact/resource-plan.ts");
const command = read("lib/first-contact/command.ts");
const repository = read("lib/leads/repository.ts");
const selector = read("components/leads/first-contact-color-selector.tsx");
const summary = read("components/leads/first-contact-summary.tsx");
const dashboard = read("components/dashboard/dashboard-client.tsx");
const migration = read("supabase/migrations/066_first_contact_optional_resources.sql");
const guardFixMigration = read("supabase/migrations/067_first_contact_optional_resources_guard_fix.sql");

for (const required of [
  "isOtherModelName",
  "firstContactResourceModelEntries",
  "model.vehicleIndex ?? index",
  "vehicleIndex: model.vehicleIndex ?? index",
]) assert(plan.includes(required), `resource scope contract missing ${required}`);
for (const required of [
  "messageModelLabel",
  "lead.carModels.every(isOtherModelName)",
  "caption: resources.modelName",
  'caption: ""',
]) assert(command.includes(required), `message/resource contract missing ${required}`);
for (const required of [
  "getFirstContactColorOptionsForLead",
  "firstContactResourceModelEntries(lead.car_models ?? [])",
  "getCarModelContactAssetsForModels(modelNames, [], vehicleIndices)",
]) assert(repository.includes(required), `repository scope contract missing ${required}`);
assert(selector.includes("initialModels") && selector.includes("disabled={!hasMultipleColors}"), "selector must show fixed-color vehicles without making them selectable");
assert(summary.includes("startWithOptionalColorSelection") && summary.includes("models.some((model) => model.colors.length > 1)"), "summary must preflight colors before opening the selector");
assert(dashboard.includes("sendWithOptionalColorSelection") && dashboard.includes("models.some((model) => model.colors.length > 1)"), "dashboard must preflight colors before opening the selector");
for (const required of [
  "jsonb_array_length(p_items) not in (3, 5, 7)",
  "photo_count not between 1 and 3",
  "sheet_count not between 1 and 3",
  "photo_count <> sheet_count",
  "jsonb_array_length(p_items) between 1 and 7",
  "photo_count not between 0 and 3",
  "sheet_count not between 0 and 3",
]) assert(migration.includes(required), `optional resource migration contract missing ${required}`);
assert(!migration.includes("create table") && !migration.includes("alter table"), "optional resource migration must only replace the request RPC");
assert(guardFixMigration.includes("jsonb_array_length(p_items) between 1 and 7"), "guard-fix migration must identify the inverted guard");
assert(guardFixMigration.includes("jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 7"), "guard-fix migration must reject only out-of-range item counts");
assert(guardFixMigration.includes("FIRST_CONTACT_V2_INVALID_GUARD_NOT_FOUND"), "guard-fix migration must fail closed if the unexpected guard is absent");
assert(!guardFixMigration.includes("create table") && !guardFixMigration.includes("alter table"), "guard-fix migration must only replace the request RPC");

console.log("E3 First Contact optional resource contract checks: PASS");
