import fs from "node:fs";

const files = [
  "components/leads/pending-notifications.tsx",
  "components/dashboard/dashboard-client.tsx",
  "lib/leads/actions.ts",
  "lib/leads/repository.ts",
  "lib/leads/follow-up.ts",
  "lib/push/types.ts",
  "lib/push/policy.ts",
  "lib/push/ports.ts",
  "lib/push/fake-dispatcher.ts",
  "lib/push/event-contracts.ts",
];
const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const offlineKernel = ["components/leads/pending-notifications.tsx", "lib/push/types.ts", "lib/push/policy.ts", "lib/push/ports.ts", "lib/push/fake-dispatcher.ts", "lib/push/event-contracts.ts"].map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const token of ["PendingNotifications", "lead.followUpActions", "expectedActionVersion", "STALE_ACTION", "resolveScheduleShortcut", "POSTPONE_PLUS_ONE_HOUR", "pushDeliveryIdentityKey", "subscriptionGeneration", "FakePushDispatcher", "PushProvider", "push_delivery_scheduled", "push_action_taken"]) if (!source.includes(token)) throw new Error(`missing integrated E5 contract ${token}`);
if (/create table|push_subscriptions|push_deliveries|webpush|VAPID|Vault|pg_cron|pg_net|dispatch-push|serviceWorker/i.test(source)) throw new Error("runtime Push scope leaked into minimum slice");
if (/raw_payload|provider_payload|api[_-]?key|secret/i.test(offlineKernel)) throw new Error("secret/raw provider data leaked into minimum slice");
console.log("Epic 5 minimum slice integrated contract checks: PASS");
