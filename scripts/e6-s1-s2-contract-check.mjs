import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/018_epic6_purchase_decision.sql", "utf8");
const database = await readFile("lib/supabase/database.ts", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");
const assert = (value, message) => { if (!value) throw new Error(message); };

for (const token of ["create table if not exists public.lead_milestones", "milestone_type = 'PURCHASE_DECISION'", "unique (lead_id, milestone_type)", "record_purchase_decision_v1", "leadflow_action_owner_v1", "deleted_at is null", "purchase_decision_recorded", "append_leadflow_event_v1", "identity_components", "milestone_id", "return jsonb_build_object('status', 'REPLAYED'"]) assert(migration.includes(token), `E6 migration contract missing ${token}`);
assert(!migration.includes("update public.leads"), "purchase decision must not update leads");
assert(!migration.includes("lead_follow_up_actions"), "purchase decision must not mutate follow-up actions");
assert(database.includes("lead_milestones") && database.includes("record_purchase_decision_v1"), "E6 database types missing");
assert(repository.includes("recordPurchaseDecision") && repository.includes("attachPurchaseMilestones"), "E6 repository adapter/read model missing");
console.log("E6-S1/S2 contract checks: PASS");
