import { readFile } from "node:fs/promises";

const component = await readFile("components/leads/follow-up-actions.tsx", "utf8");
const dashboard = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const capture = await readFile("components/leads/lead-capture-form.tsx", "utf8");
const followUp = await readFile("lib/leads/follow-up.ts", "utf8");
const actions = await readFile("lib/leads/actions.ts", "utf8");

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
if (capture.includes("merge") || capture.includes("fusion")) throw new Error("capture contains merge behavior");

console.log("E1-S9/S10/S11 UI contract check: PASS");
