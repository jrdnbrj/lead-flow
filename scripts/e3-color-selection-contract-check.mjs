import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const command = read("lib/first-contact/command.ts");
const resourcePlan = read("lib/first-contact/resource-plan.ts");
const repository = read("lib/leads/repository.ts");
const actions = read("lib/leads/actions.ts");
const validation = read("lib/leads/validation.ts");
const summary = read("components/leads/first-contact-summary.tsx");
const selector = read("components/leads/first-contact-color-selector.tsx");
const dashboard = read("components/dashboard/dashboard-client.tsx");
const migration = read("supabase/migrations/060_first_contact_color_selection_snapshot.sql");

for (const required of [
  "lead.carModels.slice(0, 3)",
  "FirstContactColorSelection",
  "applyPersistedFirstContactSnapshots",
  "for (const item of orderedItems.filter((candidate) => candidate.resourceKind !== \"MESSAGE\"))",
]) assert(command.includes(required), `color-aware command missing ${required}`);

for (const required of [
  "selectedColorId",
  "selectedColorName",
  "imageSource",
  "resourceSnapshot",
  "FirstContactColorSelection",
]) assert(resourcePlan.includes(required), `color-aware resource plan missing ${required}`);

for (const required of [
  "getFirstContactColorOptionsForLead",
  "request_first_contact_v2",
  "hydrate_first_contact_resource_v2",
  "resource_snapshot",
]) assert(repository.includes(required), `color-aware repository missing ${required}`);

for (const required of ["colorSelections", "getFirstContactColorOptionsAction"]) assert(actions.includes(required), `color-aware actions missing ${required}`);
assert(validation.includes("firstContactColorSelectionSchema"), "color selection validation missing");

for (const required of ["getFirstContactColorOptionsAction", "defaultColorId", "isDefault", "miniatura", "fetchPriority=\"high\""]) assert(selector.includes(required), `color selector missing ${required}`);
for (const required of ["FirstContactColorSelector", "onConfirm", "startFirstContactAction"]) assert(summary.includes(required), `First Contact selector integration missing ${required}`);
assert(dashboard.includes("setIsColorSelectorOpen(false);") && dashboard.includes("setIsSending(true);"), "dashboard must close the color selector and show normal send feedback");

for (const required of [
  "create table if not exists public.lead_vehicle_color_selections",
  "vehicle_index",
  "car_model_color_id",
  "resource_snapshot",
  "request_first_contact_v2",
  "hydrate_first_contact_resource_v2",
  "Historical operations are authoritative",
  "references public.car_model_colors",
  "grant execute on function public.request_first_contact_v2",
]) assert(migration.includes(required), `color selection migration missing ${required}`);

assert(migration.includes("primary key (lead_id, vehicle_index)"), "one color selection per vehicle is not enforced");
assert(migration.includes("vehicle_index between 0 and 2"), "color selection scope is not capped at three vehicles");
assert(migration.includes("revoke all on public.lead_vehicle_color_selections"), "browser color writes are not blocked");
assert(!command.includes("Promise.all(resourceSends"), "resource sends must remain serial");

console.log("E3 First Contact color selection contract checks: PASS");
