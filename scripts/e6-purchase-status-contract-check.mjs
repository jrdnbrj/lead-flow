import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/074_reversible_purchase_decision.sql", "utf8");
const historicalMigration = await readFile("supabase/migrations/018_epic6_purchase_decision.sql", "utf8");
const database = await readFile("lib/supabase/database.ts", "utf8");
const domain = await readFile("lib/domain/lead.ts", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");
const actions = await readFile("lib/leads/actions.ts", "utf8");
const validation = await readFile("lib/leads/validation.ts", "utf8");
const ui = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

const checks = [
  ["P1 mark", migration.includes("purchase_status text not null default 'PURCHASED'") && actions.includes("recordPurchaseDecisionAction") && ui.includes("Registrar compra")],
  ["P2 replay/idempotency", historicalMigration.includes("unique (lead_id, milestone_type)") && migration.includes("status', 'REPLAYED") && migration.includes("for update")],
  ["P3 revert", migration.includes("revert_purchase_decision_v1") && migration.includes("purchase_status = 'REVERTED'") && actions.includes("revertPurchaseDecisionAction") && ui.includes("Desmarcar compra")],
  ["P4 reactivate", migration.includes("status', 'REACTIVATED") && migration.includes("set purchase_status = 'PURCHASED'")],
  ["P5 historical compatibility", migration.includes("where purchase_status is null") && migration.includes("alter column purchase_status set default 'PURCHASED'") && repository.includes("row.purchase_status === undefined ? \"PURCHASED\"")],
  ["P6 active timestamp projection", repository.includes("purchase_status !== \"REVERTED\"") && repository.includes("purchaseDecisionAt")],
  ["P7 ownership and cédula", migration.includes("leadflow_action_owner_v1") && migration.includes("deleted_at is null") && validation.includes("purchaseDecisionSchema") && validation.includes("revertPurchaseDecisionSchema")],
  ["P8 combined filters", ui.includes("matchesPurchase") && ui.includes("matchesTemperature") && ui.includes("matchesStatus") && ui.includes("matchesTradeIn") && ui.includes("matchesQuery") && ui.includes("purchaseFilter")],
  ["P9 pagination and default", ui.includes('useState<PurchaseFilter>("ALL")') && ui.includes("setPurchaseFilter(filter.value); setPage(1)")],
  ["P10 preserved lead context", ui.includes("LeadContactActions") && ui.includes("CardQuoteTool") && ui.includes("FirstContactSummary") && actions.includes("No pudimos desmarcar la compra")],
  ["P11 JWT-safe purchase RPC", repository.includes('invokeAuthenticatedRpc(supabase, "record_purchase_decision_v2"') && repository.includes('invokeAuthenticatedRpc(supabase, "revert_purchase_decision_v1"')],
];

for (const [name, result] of checks) assert(result, `${name} contract missing`);
assert(database.includes("purchase_status") && database.includes("revert_purchase_decision_v1"), "database types missing reversible purchase status");
assert(domain.includes("purchaseDecisionAt: string | null"), "domain timestamp compatibility missing");
assert(repository.includes("isMissingPurchaseStatusColumn") && repository.includes("select(\"lead_id,recorded_at\")"), "legacy read fallback missing");
assert(actions.includes("requireAdvisorAction") && actions.includes("revertPurchaseDecision"), "revert action authorization boundary missing");
assert(ui.includes('aria-label="Filtro de compra"') && ui.includes('"Todos"') && ui.includes('"Compró"') && ui.includes('"No compró"'), "purchase filter labels missing");
assert(ui.includes("setPurchaseDecisionAt(null)") && ui.includes("response.success"), "revert UI must update only after persistence");
assert(!migration.includes("update public.leads\n  set status") && !migration.includes("lead_follow_up_actions") && !migration.includes("first_contact"), "purchase migration leaks into unrelated state");

console.log("E6 purchase status contract checks: PASS");
