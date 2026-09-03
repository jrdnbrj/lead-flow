import { readFile } from "node:fs/promises";

const component = await readFile("components/leads/follow-up-actions.tsx", "utf8");
const dashboard = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const capture = await readFile("components/leads/lead-capture-form.tsx", "utf8");
const followUp = await readFile("lib/leads/follow-up.ts", "utf8");
const actions = await readFile("lib/leads/actions.ts", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");
const catalog = await readFile("lib/catalog/repository.ts", "utf8");
const pushDiagnostics = await readFile("app/push-diagnostics/page.tsx", "utf8");

for (const token of ["scheduleLeadActionAction", "updateFollowUpActionAction", "clearLeadActionAction", "POSTPONED", "DONE", "IGNORED", "CANCELED", "expectedActionVersion"]) {
  if (!component.includes(token)) throw new Error(`follow-up component missing ${token}`);
}
if (!dashboard.includes("<FollowUpActions")) throw new Error("dashboard does not use reusable follow-up component");
if (!capture.includes("<FollowUpActions")) throw new Error("capture result does not use reusable follow-up component");
for (const bucket of ["getDashboardLeadBucket", "sortLeadsForDashboard", "ACTIVE", "Sin próxima acción"]) {
  if (!dashboard.includes(bucket) && !followUp.includes(bucket)) throw new Error(`dashboard ordering missing ${bucket}`);
}
if (!dashboard.includes("Actualización automática no disponible; usa Actualizar datos")) throw new Error("Realtime fallback is not visible");
if (!capture.includes("Abrir lead existente") || !capture.includes("Crear nueva oportunidad")) throw new Error("duplicate decision paths missing");
if (!actions.includes("findExistingLeadByPhoneAction")) throw new Error("E1-S3 duplicate contract is not consumed");
if (!repository.includes("DUPLICATE_LOOKUP_FAILED") || !repository.includes("createSupabaseAdminClient()")) throw new Error("duplicate lookup must fail closed with the server-only owner read");
if (!actions.includes("allowDuplicate") || !actions.includes("findLeadByPhone(parsed.data.phone)")) throw new Error("lead creation must recheck duplicates server-side and preserve explicit new-opportunity opt-in");
if (!repository.includes('requireInstallationOwnerContext("LEAD_UPDATE")') || !repository.includes('const ownerId = await getInstallationAdvisorUserId()') || !repository.includes('.eq("user_id", ownerId)')) throw new Error("lead owner mutations/lookups must use the installation owner boundary");
if (!catalog.includes('throw new Error("CATALOG_LOOKUP_FAILED")') || !catalog.includes("assetsError") || !catalog.includes("colorAssetsError")) throw new Error("catalog query failures must not render as an empty catalog");
if (!pushDiagnostics.includes("createSupabaseAdminClient()") || !pushDiagnostics.includes('throw new Error("PUSH_DIAGNOSTICS_LOOKUP_FAILED")')) throw new Error("Push Diagnostics query failures must not render as an empty result");
if (capture.includes("merge") || capture.includes("fusion")) throw new Error("capture contains merge behavior");

console.log("E1-S9/S10/S11 UI contract check: PASS");
