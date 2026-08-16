import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/036_epic5_push_runtime.sql", "utf8");
const worker = fs.readFileSync("public/sw.js", "utf8");
const dispatcher = fs.readFileSync("supabase/functions/dispatch-push/index.ts", "utf8");
const subscriptionRoute = fs.readFileSync("app/api/push/subscription/route.ts", "utf8");
const commandRoute = fs.readFileSync("app/api/push/command/route.ts", "utf8");

for (const token of ["push_subscriptions", "subscription_generation", "push_deliveries", "materialize_push_deliveries_v1", "external_effects", "WEB_PUSH", "upsert_push_subscription_v1"]) assert(migration.includes(token), `missing Push schema contract: ${token}`);
for (const token of ["push", "notificationclick", "showNotification", "DONE", "IGNORE", "POSTPONE_PLUS_ONE_HOUR", "POSTPONE_IN_THREE_DAYS"]) assert(worker.includes(token), `missing Service Worker contract: ${token}`);
for (const token of ["webpush", "VAPID_PRIVATE_KEY", "ACCEPTED", "FAILED", "UNKNOWN", "INVALIDATED"]) assert(dispatcher.includes(token), `missing dispatcher contract: ${token}`);
assert(subscriptionRoute.includes("requireAdvisor"), "subscription endpoint must require ownership");
for (const token of ["transition_lead_follow_up_action_v1", "p_expected_action_version", "PUSH_COMMAND"]) assert(commandRoute.includes(token), `missing canonical command boundary: ${token}`);
assert(!/NEXT_PUBLIC_VAPID_PRIVATE_KEY|VAPID_PRIVATE_KEY.*process\.env\./.test(worker), "private VAPID key leaked to worker");
console.log("E5 real Push runtime contract checks: PASS");
