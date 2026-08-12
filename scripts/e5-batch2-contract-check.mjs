import fs from "node:fs";

const source = [
  "lib/push/types.ts",
  "lib/push/policy.ts",
  "lib/push/ports.ts",
  "lib/push/fake-dispatcher.ts",
  "lib/push/event-contracts.ts",
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const registry = fs.readFileSync("supabase/migrations/011_leadflow_event_registry_and_append.sql", "utf8");
for (const token of ["subscriptionGeneration", "actionVersion", "SCHEDULED", "CLAIMED", "GENERATED", "ACCEPTED", "FAILED", "UNKNOWN", "CANCELED", "pushDeliveryIdentityKey", "PushSubscriptionStore", "PushScheduler", "PushProvider", "PushCapabilityConsumer", "PushDispatcher", "FakePushDispatcher"]) if (!source.includes(token)) throw new Error(`missing offline Push contract ${token}`);
for (const eventType of ["push_delivery_scheduled", "push_generated", "push_service_result", "push_subscription_activated", "push_subscription_deactivated", "push_subscription_invalid", "push_action_taken", "push_action_rejected", "push_duplicate_suppressed"]) if (!registry.includes(`'${eventType}'`)) throw new Error(`event registry contract missing ${eventType}`);
if (/supabase|createSupabase|fetch\(|axios|webpush|VAPID|Vault|pg_cron|pg_net|dispatch-push|serviceWorker|Notification/i.test(source)) throw new Error("runtime Push dependency introduced");
if (/raw_payload|secret|token/i.test(source)) throw new Error("secret/raw provider payload in offline kernel");
console.log("E5 BATCH 2 contract checks: PASS");
