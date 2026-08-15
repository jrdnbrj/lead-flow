import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/024_e1_action_event_stage_bridge.sql", "utf8");
const normalization = readFileSync("supabase/migrations/025_e1_action_event_envelope_normalization.sql", "utf8");
const aliasFix = readFileSync("supabase/migrations/026_e1_action_event_envelope_alias_fix.sql", "utf8");

assert.match(migration, /create or replace function public\.leadflow_require_event_append_v1\(p_event jsonb\)/i);
assert.match(migration, /select allowed_stage/i);
assert.match(migration, /p_event->>'event_type'/i);
assert.match(migration, /p_event \? 'stage'/i);
assert.match(migration, /EVENT_STAGE_INVALID/i);
assert.match(migration, /jsonb_set\(p_event, '\{stage\}'/i);
assert.match(migration, /append_leadflow_event_v1\(p_event\)/i);
assert.match(migration, /correlation_id=/i);

console.log("E1_SCHEDULING_STAGE_CONTRACT_PASS");

assert.match(normalization, /event_class/i);
assert.match(normalization, /event_class <> 'TRANSITION'/i);
assert.match(normalization, /p_event->'aggregate_type' = 'null'::jsonb/i);
assert.match(normalization, /p_event := p_event - 'aggregate_type'/i);
assert.match(normalization, /append_leadflow_event_v1\(p_event\)/i);
console.log("E1_SCHEDULING_ENVELOPE_CONTRACT_PASS");

assert.match(aliasFix, /registry\.allowed_stage, registry\.event_class/i);
assert.match(aliasFix, /expected_event_class <> 'TRANSITION'/i);
assert.doesNotMatch(aliasFix, /select allowed_stage, event_class\s+into expected_stage, event_class/i);
console.log("E1_SCHEDULING_ALIAS_CONTRACT_PASS");
