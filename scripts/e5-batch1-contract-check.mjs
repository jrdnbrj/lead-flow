import fs from "node:fs";

const component = fs.readFileSync("components/leads/pending-notifications.tsx", "utf8");
const action = fs.readFileSync("lib/leads/actions.ts", "utf8");
const validation = fs.readFileSync("lib/leads/validation.ts", "utf8");
const followUp = fs.readFileSync("lib/leads/follow-up.ts", "utf8");
const repository = fs.readFileSync("lib/leads/repository.ts", "utf8");
for (const token of ["lead.followUpActions", "PENDING", "POSTPONED", "actionVersion", "expectedActionVersion", "DONE", "IGNORED", "POSTPONE_PLUS_ONE_HOUR", "POSTPONE_LATER", "POSTPONE_TOMORROW", "POSTPONE_IN_THREE_DAYS"]) if (!component.includes(token)) throw new Error(`missing internal notification contract ${token}`);
for (const token of ["updateFollowUpActionAction", "resolveScheduleShortcut"]) if (!(action + followUp).includes(token)) throw new Error(`missing canonical action delegation ${token}`);
if (!repository.includes("transition_lead_follow_up_action_v1")) throw new Error("repository bypasses the canonical transition RPC");
if (!validation.includes("shortcut") || !action.includes("expectedActionVersion")) throw new Error("shortcut/version validation missing");
if (/create table|scheduler|push_deliveries|push_subscriptions|external_effects/i.test(component)) throw new Error("BATCH 1 introduced persistence/runtime scope");
if (!fs.readFileSync("components/dashboard/dashboard-client.tsx", "utf8").includes("PendingNotifications")) throw new Error("dashboard does not expose internal projection");
console.log("E5 BATCH 1 contract checks: PASS");
