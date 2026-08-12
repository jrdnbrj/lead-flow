import { readFile } from "node:fs/promises";

const ui = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");
const actions = await readFile("lib/leads/actions.ts", "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

for (const label of ["Sin respuesta sugerida", "Respuesta pendiente", "Revisar"]) assert(ui.includes(label), `missing classification label: ${label}`);
assert(ui.includes("lastInboundMessagePreview") && ui.includes("lastInboundMessageAt"), "latest inbound message is not rendered");
assert(ui.includes("Sí requiere respuesta") && ui.includes("No requiere respuesta"), "manual correction controls missing");
assert(ui.includes("correctInboundResponseAction"), "UI must delegate manual correction to E2-S8");
assert(ui.includes("actionType === \"RESPONSE\"") && ui.includes("withoutOtherOpenResponse"), "UI must keep one open RESPONSE");
assert(ui.includes("setSendError") && ui.includes("Puedes reintentarlo"), "functional error and retry path missing");
assert(ui.includes("router.refresh") && ui.includes("postgres_changes"), "refresh or realtime brownfield behavior missing");
assert(!ui.includes("classifyInboundMessage"), "classification logic must not be implemented in the component");
assert(repository.includes("inbound_classification") && !repository.includes("classifyInboundMessage"), "UI read path must use persisted classification");
assert(repository.includes("attachInboundManualDecisions") && actions.includes("correctInboundResponseAction"), "manual decision persistence adapter missing");
console.log("E2-S9 UI contract checks: PASS");
