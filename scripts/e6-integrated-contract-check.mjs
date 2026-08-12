import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/018_epic6_purchase_decision.sql", "utf8");
const repo = await readFile("lib/leads/repository.ts", "utf8");
const action = await readFile("lib/leads/actions.ts", "utf8");
const ui = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

assert(migration.includes("unique (lead_id, milestone_type)"), "milestone uniqueness missing");
assert(migration.includes("return jsonb_build_object('status', 'REPLAYED'") && migration.includes("purchase_decision_recorded"), "replay/event contract missing");
assert(migration.includes("append_leadflow_event_v1") && migration.includes("insert into public.lead_milestones"), "atomic milestone/event path missing");
assert(!migration.includes("update public.leads") && !migration.includes("lead_follow_up_actions"), "purchase decision scope mutates unrelated state");
assert(repo.includes("record_purchase_decision_v1") && repo.includes("attachPurchaseMilestones"), "read/write repository path missing");
assert(action.includes("requireAdvisorAction") && action.includes("recordPurchaseDecision"), "authorized Server Action path missing");
assert(ui.includes("purchaseDecisionAt") && ui.includes("recordPurchaseDecisionAction") && ui.includes("router.refresh"), "persisted UI refresh path missing");
assert(!ui.includes("updateLeadStatus") && !ui.includes("clearLeadActionAction"), "UI introduces commercial/follow-up mutation");
assert(!ui.includes("first_contact") && !ui.includes("push_delivery"), "Epic 3/5 scope leakage");
console.log("E6 integrated contract checks: PASS");
