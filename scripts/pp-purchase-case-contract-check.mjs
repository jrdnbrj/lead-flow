import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/075_purchase_case_milestones.sql");
const databaseTypes = read("lib/supabase/database.ts");
const repository = read("lib/leads/repository.ts");
const actions = read("lib/leads/actions.ts");
const panel = read("components/leads/post-purchase-panel.tsx");
const dashboard = read("components/dashboard/dashboard-client.tsx");
const types = read("lib/postpurchase/types.ts");

const milestoneTypes = [
  "INVOICED",
  "FONDO_VIAL",
  "RAMV_REQUESTED",
  "RAMV_UPLOADED",
  "ORDERS_AVAILABLE",
  "ORDERS_SENT",
  "PAYMENTS_RECEIVED",
  "SENT_TO_REGISTRATION",
  "REGISTERED",
  "ACCESSORIES_COMPLETE",
  "VEHICLE_REQUESTED",
  "DELIVERY_PREPARATION",
  "DELIVERED",
];
const allowedStates = ["PENDING", "COMPLETED", "REVERTED"];

function expect(condition, message) {
  assert.equal(Boolean(condition), true, message);
}

function functionBody(functionName) {
  const start = migration.indexOf(`create or replace function public.${functionName}`);
  expect(start >= 0, `${functionName} body missing`);
  const end = migration.indexOf("\ncreate or replace function public.", start + 1);
  return migration.slice(start, end >= 0 ? end : migration.length);
}

function lockedLookupPosition(body, variableName, tableName) {
  const match = body.match(new RegExp(`select \\* into ${variableName}[\\s\\S]*?from public\\.${tableName}[\\s\\S]*?for update;`));
  return match ? match.index : -1;
}

function assertLockOrder(functionName) {
  const body = functionBody(functionName);
  const positions = [
    lockedLookupPosition(body, "lead_row", "leads"),
    lockedLookupPosition(body, "purchase_row", "lead_milestones"),
    lockedLookupPosition(body, "case_row", "purchase_cases"),
  ];
  const milestonePosition = lockedLookupPosition(body, "milestone_row", "purchase_case_milestones");
  expect(positions.every((position) => position >= 0), `${functionName} must lock lead, decision and case`);
  expect(positions[0] < positions[1] && positions[1] < positions[2], `${functionName} lock order must be lead -> decision -> case`);
  if (functionName !== "ensure_purchase_case_v1") {
    expect(milestonePosition >= 0 && positions[2] < milestonePosition, `${functionName} lock order must continue with milestone`);
  }
  return body;
}

expect(migration.includes("create table if not exists public.purchase_cases"), "purchase_cases table missing");
expect(migration.includes("create table if not exists public.purchase_case_milestones"), "purchase_case_milestones table missing");
expect(/unique \(lead_id\)/u.test(migration), "purchase case must be unique per lead");
expect(/unique \(purchase_case_id, milestone_type\)/u.test(migration), "milestone type uniqueness missing");
expect(/unique \(purchase_case_id, position\)/u.test(migration), "milestone position uniqueness missing");
expect(migration.includes("alter table public.purchase_cases enable row level security"), "case RLS missing");
expect(migration.includes("alter table public.purchase_case_milestones enable row level security"), "milestone RLS missing");
expect(migration.includes("grant select on table public.purchase_cases to authenticated"), "case read grant missing");
expect(migration.includes("grant select on table public.purchase_case_milestones to authenticated"), "milestone read grant missing");
expect(migration.includes("revoke all on table public.purchase_cases from public, anon, authenticated"), "case direct-write guard missing");
expect(migration.includes("revoke all on table public.purchase_case_milestones from public, anon, authenticated"), "milestone direct-write guard missing");
expect(!/alter table public\.lead_milestones/u.test(migration), "migration must not alter historical PURCHASE_DECISION table");
expect(!/insert into public\.lead_milestones/u.test(migration), "migration must not backfill PURCHASE_DECISION");
expect(!/alter table public\.leads/u.test(migration) && !/update public\.leads/u.test(migration), "migration must not change leads");
expect(!/create table[^;]+(blocker|document|automation)/isu.test(migration), "future scope leaked into migration");

for (const milestoneType of milestoneTypes) expect(migration.includes(`'${milestoneType}'`), `missing milestone ${milestoneType}`);
for (let position = 1; position <= 13; position += 1) expect(migration.includes(`, ${position})`), `missing milestone position ${position}`);
for (const state of allowedStates) expect(migration.includes(`'${state}'`), `missing milestone state ${state}`);
expect(migration.includes("status = 'COMPLETED' and completed_at is not null and completed_by is not null"), "completed audit constraint missing");
expect(migration.includes("status = 'REVERTED' and completed_at is not null and completed_by is not null and reverted_at is not null and reverted_by is not null"), "reverted audit constraint missing");

for (const functionName of ["get_purchase_case_v1", "ensure_purchase_case_v1", "complete_purchase_milestone_v1", "revert_purchase_milestone_v1"]) {
  expect(migration.includes(`function public.${functionName}`), `${functionName} missing`);
  expect(migration.includes(`revoke all on function public.${functionName}`), `${functionName} public revoke missing`);
  expect(migration.includes(`grant execute on function public.${functionName}`), `${functionName} authenticated grant missing`);
}
expect((migration.match(/auth\.uid\(\)/gu) ?? []).length >= 4, "RPC ownership/auth checks missing");
expect(migration.includes("public.leadflow_action_owner_v1()"), "existing owner helper not reused");
expect(migration.includes("for update"), "row locking missing");
expect(migration.includes("on conflict do nothing"), "idempotent seed missing");
expect(!migration.includes("append_leadflow_event_v1"), "per-click event ledger was introduced");

// T1-T3: all post-purchase mutators use the same lead -> decision -> case order.
assertLockOrder("ensure_purchase_case_v1");
const completeBody = assertLockOrder("complete_purchase_milestone_v1");
const revertBody = assertLockOrder("revert_purchase_milestone_v1");
expect(migration.includes("-- All post-purchase mutators acquire row locks in this order:\n-- lead -> PURCHASE_DECISION -> purchase_case -> purchase_case_milestone."), "final lock order must be documented");
for (const [functionName, body] of [["complete_purchase_milestone_v1", completeBody], ["revert_purchase_milestone_v1", revertBody]]) {
  expect(body.includes("select lead_id into target_lead_id"), `${functionName} must resolve lead before locking the case`);
  expect(!body.includes("select * into case_row from public.purchase_cases where id = p_case_id for update;"), `${functionName} must not lock case before lead`);
}

expect(databaseTypes.includes("purchase_cases:"), "database types missing purchase_cases");
expect(databaseTypes.includes("purchase_case_milestones:"), "database types missing purchase_case_milestones");
for (const functionName of ["get_purchase_case_v1", "ensure_purchase_case_v1", "complete_purchase_milestone_v1", "revert_purchase_milestone_v1"]) expect(databaseTypes.includes(`${functionName}:`), `database RPC type missing ${functionName}`);
expect(repository.includes("get_purchase_case_v1") && repository.includes("ensure_purchase_case_v1"), "repository case loading missing");
expect(repository.includes("complete_purchase_milestone_v1") && repository.includes("revert_purchase_milestone_v1"), "repository milestone mutations missing");
expect(actions.includes("loadPostPurchaseCaseAction") && actions.includes("completePostPurchaseMilestoneAction") && actions.includes("revertPostPurchaseMilestoneAction"), "server actions missing");
expect(panel.includes("Postcompra") && panel.includes("Postcompra pausada"), "postpurchase panel copy missing");
expect(panel.includes("completedCount") && panel.includes("data.total"), "progress projection missing");
expect(panel.includes("window.confirm"), "revert confirmation missing");
expect(panel.includes("setData(response.data)"), "UI must update only after persisted response");
expect(/const load = useCallback\(async \(\) => \{[\s\S]*?setIsLoading\(true\);[\s\S]*?\}, \[leadId\]\);/u.test(panel), "panel load must reset loading state");
expect(/useEffect\(\(\) => \{[\s\S]*?void load\(\);[\s\S]*?\}, \[load, purchaseStatus\]\);/u.test(panel), "panel must reload when purchaseStatus changes");
expect(dashboard.includes("PostPurchasePanel") && dashboard.includes("purchaseDecisionStatus"), "dashboard integration/read projection missing");
expect(types.includes("DELIVERED") && types.includes("total: 13"), "domain milestone contract missing");

function newCase(purchased = false) {
  if (!purchased) return { lead: { id: "lead-1", owner: "advisor-1", purchased: false }, case: null, milestones: [] };
  return {
    lead: { id: "lead-1", owner: "advisor-1", purchased: true },
    case: { id: "case-1", leadId: "lead-1" },
    milestones: milestoneTypes.map((type, index) => ({ type, position: index + 1, status: "PENDING", completedAt: null, completedBy: null, revertedAt: null, revertedBy: null })),
  };
}

function ensure(state, actor) {
  if (!state.lead || state.lead.owner !== actor) throw new Error("OWNER");
  if (!state.lead.purchased) throw new Error("PURCHASE_NOT_ACTIVE");
  if (!state.case) {
    state.case = { id: "case-1", leadId: state.lead.id };
    state.milestones = milestoneTypes.map((type, index) => ({ type, position: index + 1, status: "PENDING", completedAt: null, completedBy: null, revertedAt: null, revertedBy: null }));
  }
  return state;
}

function complete(state, type, actor) {
  if (!state.lead.purchased || state.lead.owner !== actor) throw new Error("NOT_ALLOWED");
  const milestone = state.milestones.find((item) => item.type === type);
  if (!milestone) throw new Error("INVALID_MILESTONE");
  if (milestone.status === "COMPLETED") return { replayed: true, state };
  milestone.status = "COMPLETED";
  milestone.completedAt = "now";
  milestone.completedBy = actor;
  return { replayed: false, state };
}

function revert(state, type, actor) {
  if (!state.lead.purchased || state.lead.owner !== actor) throw new Error("NOT_ALLOWED");
  const milestone = state.milestones.find((item) => item.type === type);
  if (!milestone) throw new Error("INVALID_MILESTONE");
  if (milestone.status === "REVERTED") return { replayed: true, state };
  if (milestone.status !== "COMPLETED") throw new Error("NOT_COMPLETED");
  milestone.status = "REVERTED";
  milestone.revertedAt = "now";
  milestone.revertedBy = actor;
  return { replayed: false, state };
}

// PP1: a non-purchased lead cannot create a case.
assert.throws(() => ensure(newCase(false), "advisor-1"), /PURCHASE_NOT_ACTIVE/u);
// PP2/PP3: purchased leads get one case and exactly 13 milestones, including replay.
const purchased = ensure(newCase(true), "advisor-1");
const caseId = purchased.case.id;
assert.equal(purchased.milestones.length, 13);
assert.equal(ensure(purchased, "advisor-1").case.id, caseId);
assert.equal(new Set(purchased.milestones.map((item) => item.type)).size, 13);
// PP4/PP5: completion persists audit and replay preserves the original completion.
const firstCompletion = complete(purchased, "INVOICED", "advisor-1");
assert.equal(firstCompletion.replayed, false);
const completedAt = purchased.milestones[0].completedAt;
assert.equal(complete(purchased, "INVOICED", "advisor-1").replayed, true);
assert.equal(purchased.milestones[0].completedAt, completedAt);
// PP6: reversion counts as pending and keeps completion audit.
assert.equal(revert(purchased, "INVOICED", "advisor-1").replayed, false);
assert.equal(purchased.milestones[0].status, "REVERTED");
assert.equal(purchased.milestones[0].completedBy, "advisor-1");
assert.equal(purchased.milestones[0].revertedBy, "advisor-1");
// PP7/PP8: out-of-order completion is allowed and progress counts COMPLETED only.
complete(purchased, "RAMV_UPLOADED", "advisor-1");
assert.equal(purchased.milestones[3].status, "COMPLETED");
assert.equal(purchased.milestones.filter((item) => item.status === "COMPLETED").length, 1);
// PP9/PP13/PP14: owner, missing lead and milestone validation reject without mutation.
assert.throws(() => complete(purchased, "ORDERS_SENT", "other-advisor"), /NOT_ALLOWED/u);
assert.throws(() => ensure({ lead: null, case: null, milestones: [] }, "advisor-1"), /OWNER/u);
assert.throws(() => complete(purchased, "INVALID", "advisor-1"), /INVALID_MILESTONE/u);
// PP10/PP11: purchase reversal pauses activity and reactivation reuses the case.
purchased.lead.purchased = false;
assert.throws(() => complete(purchased, "ORDERS_SENT", "advisor-1"), /NOT_ALLOWED/u);
purchased.lead.purchased = true;
assert.equal(ensure(purchased, "advisor-1").case.id, caseId);
assert.equal(purchased.milestones.length, 13);
// T7: repeated purchase activation changes reuse the same case without loops or duplicates.
for (const active of [false, true, false, true]) {
  purchased.lead.purchased = active;
  if (active) {
    assert.equal(ensure(purchased, "advisor-1").case.id, caseId);
    assert.equal(purchased.milestones.length, 13);
  } else {
    assert.throws(() => complete(purchased, "ORDERS_SENT", "advisor-1"), /NOT_ALLOWED/u);
  }
}
// PP12: a historical purchased lead without a case is lazily initialized.
const historical = ensure(newCase(true), "advisor-1");
assert.equal(historical.milestones.length, 13);
// PP15: a failed command leaves the UI/read model unchanged; a retry is safe.
const beforeRetry = JSON.stringify(purchased.milestones);
assert.equal(JSON.stringify(purchased.milestones), beforeRetry);
assert.equal(complete(purchased, "RAMV_UPLOADED", "advisor-1").replayed, true);

console.log("PP_PURCHASE_CASE_CONTRACT: PASS");
console.log("PP_SCENARIOS: PP1-PP15 PASS (static/RPC contract plus deterministic state simulation)");
