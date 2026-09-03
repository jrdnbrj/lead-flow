import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const command = read("lib/first-contact/command.ts");
const resourcePlan = read("lib/first-contact/resource-plan.ts");
const order = read("lib/first-contact/order.ts");
const ui = read("components/leads/first-contact-summary.tsx");
const repository = read("lib/leads/repository.ts");
const migration = read("supabase/migrations/049_first_contact_multi_vehicle_resources.sql");
const eventProjectionMigration = read("supabase/migrations/052_first_contact_event_resource_projection.sql");
const eventAppendCompatibilityMigration = read("supabase/migrations/053_first_contact_event_append_compatibility.sql");
const resourceRecoveryMigration = read("supabase/migrations/059_e3_resource_recovery.sql");
const eventCategoriesFixMigration = read("supabase/migrations/062_first_contact_event_resource_categories_fix.sql");
const eventCategoriesQualificationMigration = read("supabase/migrations/063_first_contact_event_resource_categories_qualification.sql");

for (const token of [
  "firstContactResourceModelEntries(lead.carModels)",
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
assert(eventProjectionMigration.includes("select distinct") && eventProjectionMigration.includes("requested_resource_kinds"), "multi-vehicle event resource projection must deduplicate categories");
assert(eventAppendCompatibilityMigration.includes("append_leadflow_event_v1(\n  p_event jsonb,\n  p_identity_key text,\n  p_identity_components jsonb") && eventAppendCompatibilityMigration.includes("identity_components") && eventAppendCompatibilityMigration.includes("p_event || jsonb_build_object"), "multi-vehicle event append compatibility adapter missing");
assert(eventCategoriesFixMigration.includes("select distinct value->>'resource_kind'") && eventCategoriesFixMigration.includes("requested_resources"), "first-contact event resource categories must be deduplicated");
assert(eventCategoriesQualificationMigration.includes("resource_categories.resource_kind") && eventCategoriesQualificationMigration.includes("pg_get_functiondef"), "first-contact event resource column must be qualified");

assert(order.includes("itemKey") && order.includes("Number(leftScoped[2]) - Number(rightScoped[2])"), "model-major resource ordering missing");
assert(ui.includes("firstContactItemLabel") && ui.includes("leadModels={lead.carModels}"), "model/resource labels missing from First Contact UI");
assert(repository.includes("getCarModelContactAssetsForModels") && repository.includes("assets.length === 0 ? legacyImageByModel"), "bounded resource lookup or legacy fallback contract missing");
for (const token of [
  'from("car_model_colors")',
  '.eq("slug", "blanco")',
  'from("car_model_color_assets")',
  "whitePhotoByModel",
  "whitePhoto ? getPublicVehicleAssetUrl(whitePhoto.storage_path)",
  "createSupabaseAdminClient() ?? await createSupabaseServerClient()",
  "FIRST_CONTACT_CATALOG_LOOKUP_FAILED",
]) assert(repository.includes(token), `white First Contact photo preference missing ${token}`);
for (const token of ["hydrate_first_contact_resource_v1", "FIRST_CONTACT_RESOURCE_INPUT_INVALID", "ALREADY_ACCEPTED", "ALREADY_AVAILABLE", "HYDRATED", "on conflict (lead_id, effect_kind, business_key) do nothing", "to service_role"]) assert(resourceRecoveryMigration.includes(token), `resource recovery migration missing ${token}`);
for (const token of ["hydrateMissingFirstContactResource", "itemKey", "const refreshed = await requestFirstContact"]) assert(command.includes(token), `resource recovery execution missing ${token}`);
for (const token of ["No disponible aún", "retryItem", "item.availability === \"NOT_AVAILABLE\""]) assert(ui.includes(token), `resource recovery UI missing ${token}`);

console.log("E3 multi-vehicle resource contract checks: PASS");
