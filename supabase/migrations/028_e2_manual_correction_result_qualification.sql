-- E2 runtime fix: qualify the manual-decision result column to avoid
-- ambiguity with the function-local result variable.

create or replace function public.correct_inbound_response_v1(
  p_lead_id uuid,
  p_decision text,
  p_source_message_id uuid default null,
  p_action_id uuid default null,
  p_expected_action_version bigint default null,
  p_scheduled_for timestamptz default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  action_id uuid;
  found_action_type public.next_action_type;
  result jsonb;
  existing jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_decision not in ('REQUIRES_RESPONSE', 'NO_RESPONSE_REQUIRED') then
    raise exception using errcode = '22023', message = 'MANUAL_DECISION_INVALID';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 184 then
    raise exception using errcode = '22023', message = 'MANUAL_COMMAND_INPUT_REQUIRED';
  end if;
  select d.result into existing
  from public.lead_inbound_manual_decisions as d
  where d.idempotency_key = p_idempotency_key;
  if existing is not null then return existing || jsonb_build_object('replayed', true); end if;
  select * into lead_row from public.leads where id = p_lead_id and user_id = owner_id and deleted_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED'; end if;

  if p_decision = 'REQUIRES_RESPONSE' then
    if p_source_message_id is null or p_scheduled_for is null then
      raise exception using errcode = '22023', message = 'SOURCE_MESSAGE_AND_SCHEDULE_REQUIRED';
    end if;
    if not exists (select 1 from public.lead_messages where id = p_source_message_id and lead_id = p_lead_id and direction = 'INBOUND') then
      raise exception using errcode = '22023', message = 'SOURCE_MESSAGE_NOT_FOUND';
    end if;
    result := public.upsert_inbound_response_action_v1(p_lead_id, p_source_message_id, 'PENDING', p_scheduled_for, p_idempotency_key || ':action');
    action_id := nullif(result #>> '{action,id}', '')::uuid;
  else
    select id, action_type into action_id, found_action_type
    from public.lead_follow_up_actions
    where id = coalesce(p_action_id, (select id from public.lead_follow_up_actions where lead_id = p_lead_id and action_type = 'RESPONSE' and status in ('PENDING', 'POSTPONED') order by scheduled_for asc, created_at asc, id asc limit 1))
      and lead_id = p_lead_id
    for update;
    if action_id is null or found_action_type <> 'RESPONSE' then
      raise exception using errcode = '22023', message = 'RESPONSE_ACTION_NOT_FOUND';
    end if;
    if p_expected_action_version is null then
      raise exception using errcode = '22023', message = 'EXPECTED_ACTION_VERSION_REQUIRED';
    end if;
    result := public.transition_lead_follow_up_action_v1(p_action_id => action_id, p_status => 'IGNORED', p_expected_action_version => p_expected_action_version, p_scheduled_for => null, p_note => 'Marcado como no requiere respuesta.', p_idempotency_key => p_idempotency_key || ':action', p_cancel_reason => null);
  end if;

  insert into public.lead_inbound_manual_decisions (idempotency_key, lead_id, source_message_id, action_id, decision, result)
  values (p_idempotency_key, p_lead_id, p_source_message_id, action_id, p_decision, result);
  return result || jsonb_build_object('manual_decision', p_decision, 'replayed', false);
end;
$$;

revoke all on function public.correct_inbound_response_v1(uuid, text, uuid, uuid, bigint, timestamptz, text) from public, anon;
grant execute on function public.correct_inbound_response_v1(uuid, text, uuid, uuid, bigint, timestamptz, text) to authenticated;
