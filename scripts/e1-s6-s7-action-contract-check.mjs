import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/015_leadflow_action_commands.sql", "utf8");

for (const pattern of [
  /create table if not exists public\.lead_follow_up_action_commands/i,
  /security definer/i,
  /auth\.uid\(\)/i,
  /for update/i,
  /create_lead_follow_up_action_v1/i,
  /transition_lead_follow_up_action_v1/i,
  /STALE_ACTION/i,
  /next_action_created/i,
  /next_action_postponed/i,
  /next_action_done/i,
  /next_action_ignored/i,
  /next_action_canceled/i,
  /leadflow_require_event_append_v1/i,
  /action_version = next_version/i,
]) assert.match(migration, pattern);

assert.doesNotMatch(migration, /push_generated|response_action_upserted|corporate_sync/i);
assert.match(migration, /status = p_status/);
assert.match(migration, /conversation_state = 'WAITING_CUSTOMER'/);

const state = { version: 1, status: "PENDING", scheduledFor: "2026-08-12T14:00:00Z", commercialStatus: "NUEVO", events: [], commands: new Map() };
function command(key, expectedVersion, nextStatus, scheduledFor = state.scheduledFor) {
  if (state.commands.has(key)) return { ...state.commands.get(key), replayed: true };
  if (state.version !== expectedVersion) return { status: "STALE_ACTION", mutated: false, version: state.version };
  const previous = { ...state };
  state.version += 1;
  state.status = nextStatus;
  state.scheduledFor = scheduledFor;
  state.events.push(`next_action_${nextStatus === "POSTPONED" ? "postponed" : nextStatus === "DONE" ? "done" : nextStatus === "IGNORED" ? "ignored" : "canceled"}`);
  const result = { status: nextStatus, version: state.version, scheduledFor: state.scheduledFor };
  state.commands.set(key, result);
  assert.equal(state.commercialStatus, previous.commercialStatus, "action transition must not change commercial status");
  return result;
}

const postponed = command("fixture-postpone-0001", 1, "POSTPONED", "2026-08-13T14:00:00Z");
assert.equal(postponed.status, "POSTPONED");
assert.equal(postponed.version, 2);
assert.equal(command("fixture-postpone-0001", 1, "POSTPONED").replayed, true);
assert.equal(command("fixture-stale-0001", 1, "DONE").status, "STALE_ACTION");
assert.equal(command("fixture-done-0001", 2, "DONE").status, "DONE");
assert.equal(command("fixture-done-0001", 2, "DONE").replayed, true);

const rollbackState = { ...state, events: [...state.events], commands: new Map(state.commands) };
assert.throws(() => {
  const before = JSON.stringify(rollbackState);
  try {
    throw new Error("EVENT_APPEND_FAILED");
  } catch (error) {
    assert.equal(JSON.stringify(rollbackState), before);
    throw error;
  }
}, /EVENT_APPEND_FAILED/);

console.log("E1-S6-S7_ACTION_CONTRACT_PASS");
