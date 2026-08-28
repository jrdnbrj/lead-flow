import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const command = read("lib/first-contact/command.ts");
const resourcePlan = read("lib/first-contact/resource-plan.ts");
const order = read("lib/first-contact/order.ts");
const ui = read("components/leads/first-contact-summary.tsx");
const repository = read("lib/leads/repository.ts");
const migration = read("supabase/migrations/049_first_contact_multi_vehicle_resources.sql");

for (const token of [
  "lead.carModels.slice(0, 3)",
  "lead.carModels.join(\", \"",
  "getCarModelContactAssetsForModels",
  "resourcesByItemKey",
  "FIRST_CONTACT_PHOTO_NOT_AVAILABLE",
  "FIRST_CONTACT_SHEET_NOT_AVAILABLE",
]) assert(command.includes(token), `multi-vehicle command missing ${token}`);
for (const token of ["modelResourceItemKey", "planFirstContactResourceItems", "isModelScopedResourceKey", "resourcesByItemKey"]) assert(resourcePlan.includes(token), `multi-vehicle resource plan missing ${token}`);
assert(command.includes("for (const item of orderedItems.filter((candidate) => candidate.resourceKind !== \"MESSAGE\"))"), "resources are not sent serially after MESSAGE");
assert(!command.includes("Promise.all(begunResources") && !command.includes("Promise.all(resourceSends"), "resource sends must not run in parallel");
assert(command.includes("const directItem = claimItemKey"), "retry does not identify the exact resource item");

for (const token of ["jsonb_array_length(p_items) not in (3, 5, 7)", "count(*) filter (where value->>'resource_kind' = 'MESSAGE')", "count(*) filter (where value->>'resource_kind' = 'PHOTOS')", "count(*) filter (where value->>'resource_kind' = 'TECHNICAL_SHEET')", "Historical operations are authoritative", "external_effects", "operation_row.id::text || ':' || item_key || ':' || resource_version"]) assert(migration.includes(token), `multi-vehicle migration missing ${token}`);
assert(migration.includes("photo_count <> sheet_count"), "photo/sheet model pairing validation missing");
assert(migration.includes("grant execute on function public.request_first_contact_v1") && migration.includes("to authenticated"), "request RPC grant is not preserved");
assert(!migration.includes("grant execute on function public.request_first_contact_v1(uuid, text, jsonb, text) to anon"), "request RPC must not be granted to anon");

assert(order.includes("itemKey") && order.includes("Number(leftScoped[2]) - Number(rightScoped[2])"), "model-major resource ordering missing");
assert(ui.includes("firstContactItemLabel") && ui.includes("leadModels={lead.carModels}"), "model/resource labels missing from First Contact UI");
assert(repository.includes("getCarModelContactAssetsForModels") && repository.includes("assets.length === 0 ? legacyImageByModel"), "bounded resource lookup or legacy fallback contract missing");

console.log("E3 multi-vehicle resource contract checks: PASS");
