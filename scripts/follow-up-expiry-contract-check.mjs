import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/069_auto_ignore_overdue_follow_up_actions.sql", "utf8");
const followUp = fs.readFileSync("lib/leads/follow-up.ts", "utf8");
const dashboard = fs.readFileSync("components/dashboard/dashboard-client.tsx", "utf8");
const pending = fs.readFileSync("components/leads/pending-notifications.tsx", "utf8");
const actions = fs.readFileSync("components/leads/follow-up-actions.tsx", "utf8");
const push = fs.readFileSync("supabase/functions/dispatch-push/index.ts", "utf8");
const whatsapp = fs.readFileSync("app/api/internal/whatsapp-reminders/dispatch/route.ts", "utf8");

for (const token of [
  "auto_ignore_expired_follow_up_actions_v1",
  "status = 'IGNORED'",
  "scheduled_for < p_now - interval '15 days'",
  "CANCELED_ACTION_EXPIRED",
  "ACTION_EXPIRED",
]) assert.ok(migration.includes(token), `expiry migration missing ${token}`);
for (const source of [followUp, dashboard, pending, actions, push, whatsapp]) assert.match(source, /15 days|15 días|TooOld|expired_follow_up|ACTION_EXPIRED|CANCELED_ACTION_EXPIRED/u, "15-day expiry guard missing");
assert.match(followUp, /reference\.getTime\(\) - scheduledAt > LEAD_REMINDER_MAX_OVERDUE_MS/u);
assert.match(pending, /!isLeadReminderTooOld/u);
assert.match(actions, /!isLeadReminderTooOld/u);
assert.match(push, /auto_ignore_expired_follow_up_actions_v1/u);
assert.match(whatsapp, /auto_ignore_expired_follow_up_actions_v1/u);

console.log("Follow-up expiry contract checks: PASS");
