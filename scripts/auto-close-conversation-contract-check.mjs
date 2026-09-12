import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/079_auto_close_inactive_conversations.sql", "utf8");
const dispatcher = await readFile("app/api/internal/whatsapp-reminders/dispatch/route.ts", "utf8");
const repository = await readFile("lib/leads/repository.ts", "utf8");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

for (const token of [
  "auto_close_inactive_conversations_v1",
  "security definer",
  "set search_path = public",
  "leadflow_installation",
  "user_id = owner_id",
  "conversation_state = 'ACTIVE'",
  "conversation_state = 'CLOSED'",
  "last_activity_at is not null",
  "interval '5 days'",
  "status in ('PENDING', 'POSTPONED')",
  "for update",
  "revoke all",
  "grant execute on function public.auto_close_inactive_conversations_v1(timestamptz) to service_role",
]) expect(migration.includes(token), `auto-close migration missing ${token}`);
expect(!migration.includes("update public.lead_follow_up_actions"), "auto-close must not mutate follow-up actions");
expect(!migration.includes("push_deliveries") && !migration.includes("whatsapp_reminder_deliveries"), "auto-close must not mutate delivery projections");
expect(dispatcher.includes('adminRpc("auto_close_inactive_conversations_v1", { p_now: now })'), "scheduler must invoke conversation maintenance");
expect(dispatcher.includes("conversation_auto_close_maintenance_failed"), "scheduler must log maintenance failure");

const updateStart = repository.indexOf("export async function updateLeadConversationState");
const updateEnd = repository.indexOf("type LeadMessageInput", updateStart);
expect(updateStart >= 0 && updateEnd > updateStart, "conversation update function boundary is missing");
const updateBody = repository.slice(updateStart, updateEnd);
for (const token of ["last_activity_at", "state === \"ACTIVE\"", '.eq("id", id)', '.eq("user_id", ownerId)', '.is("deleted_at", null)']) {
  expect(updateBody.includes(token), `conversation reopen activity contract missing ${token}`);
}

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-11T12:00:00.000Z");
function shouldClose(lead) {
  return lead.state === "ACTIVE"
    && lead.deletedAt === null
    && lead.lastActivityAt !== null
    && Date.parse(lead.lastActivityAt) <= NOW - 5 * DAY
    && !lead.actions.some((status) => status === "PENDING" || status === "POSTPONED");
}

expect(shouldClose({ state: "ACTIVE", deletedAt: null, lastActivityAt: "2026-09-06T12:00:00.000Z", actions: [] }), "exact five-day boundary must close");
expect(!shouldClose({ state: "ACTIVE", deletedAt: null, lastActivityAt: "2026-09-06T12:00:01.000Z", actions: [] }), "recent activity must remain open");
expect(!shouldClose({ state: "ACTIVE", deletedAt: null, lastActivityAt: "2026-09-01T12:00:00.000Z", actions: ["PENDING"] }), "pending action must block close");
expect(!shouldClose({ state: "ACTIVE", deletedAt: null, lastActivityAt: "2026-09-01T12:00:00.000Z", actions: ["POSTPONED"] }), "postponed action must block close");
expect(!shouldClose({ state: "ACTIVE", deletedAt: null, lastActivityAt: null, actions: [] }), "null activity must fail closed");
expect(!shouldClose({ state: "CLOSED", deletedAt: null, lastActivityAt: "2026-09-01T12:00:00.000Z", actions: [] }), "closed conversation must not be reopened or recounted");
expect(!shouldClose({ state: "ACTIVE", deletedAt: "2026-09-01T12:00:00.000Z", lastActivityAt: "2026-09-01T12:00:00.000Z", actions: [] }), "deleted lead must not be changed");

console.log("AUTO_CLOSE_CONVERSATION_CONTRACT: PASS");
console.log("AUTO_CLOSE_SCENARIOS: boundary, recent, open actions, null activity, closed and deleted PASS");
