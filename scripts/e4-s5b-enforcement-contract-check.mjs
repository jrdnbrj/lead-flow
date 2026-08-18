import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/012_leadflow_event_enforcement_and_atomicity.sql', 'utf8');
assert.match(migration, /before update or delete on public\.leadflow_events/i);
assert.match(migration, /LEADFLOW_EVENTS_APPEND_ONLY/);
assert.match(migration, /leadflow_require_event_append_v1/);
assert.match(migration, /status.*APPENDED.*REPLAYED/is);
assert.match(migration, /raise exception/i);
assert.doesNotMatch(migration, /corporate_sync|push_generated|whatsapp/i);

const transaction = (rows, mutation, append) => {
  const draft = rows.map((row) => ({ ...row }));
  mutation(draft);
  const event = append(draft);
  if (event.status !== 'APPENDED' && event.status !== 'REPLAYED') throw new Error('EVENT_APPEND_FAILED');
  return { rows: draft, event };
};
const original = [{ id: 'lead-1', status: 'OPEN' }];
const committed = transaction(original, (draft) => { draft[0].status = 'CLOSED'; }, () => ({ status: 'APPENDED' }));
assert.equal(committed.rows[0].status, 'CLOSED');
assert.throws(() => transaction(original, (draft) => { draft[0].status = 'CLOSED'; }, () => ({ status: 'EVENT_KEY_CONFLICT' })), /EVENT_APPEND_FAILED/);
assert.equal(original[0].status, 'OPEN');
assert.throws(() => transaction(original, (draft) => { draft[0].status = 'CLOSED'; }, () => { throw new Error('append rejected'); }), /append rejected/);
assert.equal(original[0].status, 'OPEN');
assert.match(migration, /current_user not in \('postgres', 'supabase_admin'\)/);
assert.match(migration, /correlation_id=/);
const fixtureSql = `
begin;
update public.leadflow_event_registry set emit_status='ENABLED' where event_type='lead_capture_failed' and schema_version=1;
do $$ declare result jsonb; caught text; event jsonb := jsonb_build_object('event_type','lead_capture_failed','schema_version',1,'occurred_at','2026-08-11T23:00:00Z','source','PWA','stage','CAPTURE','actor_kind','ADVISOR','actor_id','1331ad98-0430-4025-88d6-9c1f68083f68','correlation_id','00000000-0000-4000-8000-000000000001','payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','idempotency_key','value','fixture-1'),jsonb_build_object('name','stage','value','CAPTURE'))); begin perform public.leadflow_require_event_append_v1(jsonb_set(event,'{event_type}','\"push_generated\"'::jsonb)); raise exception 'rejection fixture did not reject'; exception when others then get stacked diagnostics caught=message_text; if position('correlation_id=00000000-0000-4000-8000-000000000001' in caught)=0 then raise exception using message=caught; end if; end $$;
select public.leadflow_require_event_append_v1(jsonb_build_object('event_type','lead_capture_failed','schema_version',1,'occurred_at','2026-08-11T23:00:00Z','source','PWA','stage','CAPTURE','actor_kind','ADVISOR','actor_id','1331ad98-0430-4025-88d6-9c1f68083f68','correlation_id','00000000-0000-4000-8000-000000000001','payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','idempotency_key','value','fixture-1'),jsonb_build_object('name','stage','value','CAPTURE'))))->>'status';
select public.leadflow_require_event_append_v1(jsonb_build_object('event_type','lead_capture_failed','schema_version',1,'occurred_at','2026-08-11T23:00:00Z','source','PWA','stage','CAPTURE','actor_kind','ADVISOR','actor_id','1331ad98-0430-4025-88d6-9c1f68083f68','correlation_id','00000000-0000-4000-8000-000000000001','payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','idempotency_key','value','fixture-1'),jsonb_build_object('name','stage','value','CAPTURE'))))->>'status';
do $$ declare caught text; begin perform public.leadflow_require_event_append_v1(jsonb_build_object('event_type','lead_capture_failed','schema_version',1,'occurred_at','2026-08-11T23:00:01Z','source','PWA','stage','CAPTURE','actor_kind','ADVISOR','actor_id','1331ad98-0430-4025-88d6-9c1f68083f68','correlation_id','00000000-0000-4000-8000-000000000002','payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','idempotency_key','value','fixture-1'),jsonb_build_object('name','stage','value','CAPTURE')))); raise exception 'conflict fixture did not reject'; exception when others then get stacked diagnostics caught=message_text; if position('correlation_id=00000000-0000-4000-8000-000000000002' in caught)=0 then raise exception using message=caught; end if; end $$;
rollback;
select 'E4_S5B_DB_FIXTURES_PASS';`;
const db = spawnSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', fixtureSql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } });
assert.equal(db.status, 0, db.stderr || db.stdout);
assert.match(db.stdout, /E4_S5B_DB_FIXTURES_PASS/);

console.log('E4-S5B_ENFORCEMENT_CONTRACT_PASS');
