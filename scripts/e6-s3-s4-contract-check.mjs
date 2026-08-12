import { readFile } from "node:fs/promises";

const actions = await readFile("lib/leads/actions.ts", "utf8");
const ui = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const repo = await readFile("lib/leads/repository.ts", "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

assert(actions.includes("recordPurchaseDecisionAction") && actions.includes("ActionResponse"), "purchase decision Server Action missing");
assert(actions.includes("requireAdvisorAction") && actions.includes("recordPurchaseDecision"), "Server Action must authorize and delegate to RPC adapter");
assert(!actions.includes("from(\"lead_milestones\")"), "Server Action must not persist milestones directly");
assert(ui.includes("Cliente decidió comprar") && ui.includes("Compra registrada"), "purchase decision UI labels missing");
assert(ui.includes("recordPurchaseDecisionAction") && ui.includes("¿Registrar esta decisión"), "UI confirmation/delegation missing");
assert(ui.includes("purchaseDecisionAt") && ui.includes("recordedAt"), "UI must consume persisted timestamp");
assert(!ui.includes("updateLeadStatus") && !ui.includes("setLeadStatus"), "UI must not change commercial status");
assert(repo.includes("attachPurchaseMilestones") && repo.includes("record_purchase_decision_v1"), "repository read/write boundary missing");
console.log("E6-S3/S4 contract checks: PASS");
