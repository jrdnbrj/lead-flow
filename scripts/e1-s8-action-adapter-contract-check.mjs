import { readFile } from "node:fs/promises";

const repository = await readFile("lib/leads/repository.ts", "utf8");
const actions = await readFile("lib/leads/actions.ts", "utf8");
const validation = await readFile("lib/leads/validation.ts", "utf8");
const dashboard = await readFile("components/dashboard/dashboard-client.tsx", "utf8");
const followUpComponent = await readFile("components/leads/follow-up-actions.tsx", "utf8");

function block(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`missing ${name}`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

const create = block(repository, "createFollowUpAction");
const update = block(repository, "updateFollowUpAction");
const clear = block(repository, "clearLeadAction");

for (const [name, source] of [["create", create], ["update", update], ["clear", clear]]) {
  if (source.includes('.from("lead_follow_up_actions").insert') || source.includes('.from("lead_follow_up_actions").update') || source.includes('.from("lead_follow_up_actions").delete')) {
    throw new Error(`${name} adapter still mutates lead_follow_up_actions directly`);
  }
}

if (!create.includes('rpc("create_lead_follow_up_action_v1"')) throw new Error("create adapter does not call canonical RPC");
if (!update.includes('rpc("transition_lead_follow_up_action_v1"')) throw new Error("update adapter does not call canonical transition RPC");
if (!clear.includes('rpc("transition_lead_follow_up_action_v1"')) throw new Error("clear adapter does not use canonical transition RPC");
if (!update.includes("p_expected_action_version: version")) throw new Error("update adapter does not propagate expected version");
if (!clear.includes("p_expected_action_version: action.action_version")) throw new Error("clear adapter does not use stored action version");
if (!actions.includes("Promise<ActionResponse")) throw new Error("server actions lost ActionResponse contract");
if (!actions.includes('error: "No pudimos programar ese recordatorio."')) throw new Error("create functional error is not sanitized");
if (!dashboard.includes("<FollowUpActions") || !followUpComponent.includes("expectedActionVersion: action.actionVersion")) throw new Error("follow-up adapter does not pass expected action version");
if (!validation.includes("expectedActionVersion")) throw new Error("validation schema does not accept expected action version");

console.log("E1-S8 adapter contract check: PASS");
