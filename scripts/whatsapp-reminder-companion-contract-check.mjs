import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/045_whatsapp_reminder_companion.sql", "utf8");
const route = await readFile("app/api/internal/whatsapp-reminders/dispatch/route.ts", "utf8");
const runtime = await readFile("lib/whatsapp/reminders.ts", "utf8");
const webhook = await readFile("app/api/webhooks/evolution/route.ts", "utf8");
const push = await readFile("supabase/functions/dispatch-push/index.ts", "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const token of [
  "whatsapp_reminder_deliveries",
  "WHATSAPP_REMINDER",
  "materialize_whatsapp_reminder_deliveries_v1",
  "claim_whatsapp_reminder_delivery_v1",
  "revalidate_whatsapp_reminder_delivery_v1",
  "record_whatsapp_reminder_result_v1",
  "PENDING",
  "POSTPONED",
  "service_role",
  "STALE_ACTION_BEFORE_IO",
]) assert(migration.includes(token), `missing WhatsApp reminder schema contract: ${token}`);

for (const token of [
  "validateWhatsappReminderDispatcherRequest",
  "materialize_whatsapp_reminder_deliveries_v1",
  "claim_whatsapp_reminder_delivery_v1",
  "revalidate_whatsapp_reminder_delivery_v1",
  "record_whatsapp_reminder_result_v1",
  "sendWhatsappReminderText",
  "MAX_BATCH_SIZE",
]) assert(route.includes(token), `missing WhatsApp reminder route contract: ${token}`);

assert(runtime.includes("WHATSAPP_REMINDER_EVOLUTION_INSTANCE"), "reminder instance must be server-configured");
assert(runtime.includes("WHATSAPP_REMINDER_RECIPIENT"), "reminder recipient must be server-configured");
assert(runtime.includes("reminderInstance === customerInstance"), "reminder sender must fail closed on customer instance reuse");
assert(!runtime.includes("NEXT_PUBLIC_"), "reminder runtime must not use browser-public configuration");
assert(webhook.includes("belongsToCustomerInstance"), "Evolution webhook must isolate the customer instance before processing");
assert(push.includes("claim_push_delivery_v1"), "Push dispatcher must use atomic authoritative claim");
assert(push.includes("revalidate_push_delivery_v1"), "Push dispatcher must revalidate immediately before provider IO");

console.log("WhatsApp reminder companion contract checks: PASS");
