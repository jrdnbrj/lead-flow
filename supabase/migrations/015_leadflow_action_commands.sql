-- E1-S6 / E1-S7: versioned action commands and atomic lifecycle transitions.
-- Runtime migration execution is intentionally deferred for this phase.

create table if not exists public.lead_follow_up_action_commands (
  idempotency_key text primary key check (length(idempotency_key) between 16 and 200),
  lead_id uuid not null references public.leads(id) on delete cascade,
  action_id uuid references public.lead_follow_up_actions(id) on delete cascade,
  command text not null check (command in ('CREATE', 'POSTPONE', 'DONE', 'IGNORE', 'CANCEL')),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.lead_follow_up_action_commands enable row level security;
revoke all on public.lead_follow_up_action_commands from public, anon, authenticated;

update public.leadflow_event_registry
set emit_status = 'ENABLED', updated_at = now()
where event_type in (
  'next_action_created',
  'next_action_postponed',
  'next_action_done',
  'next_action_ignored',
  'next_action_canceled'
);

create or replace function public.leadflow_action_owner_v1()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid;
begin
  select advisor_user_id
  into owner_id
  from public.leadflow_installation
  where singleton = true
    and advisor_user_id = auth.uid();

  if owner_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  return owner_id;
end;
$$;

create or replace function public.leadflow_action_json_v1(p_action public.lead_follow_up_actions)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_action.id,
    'lead_id', p_action.lead_id,
    'action_type', p_action.action_type,
    'scheduled_for', p_action.scheduled_for,
    'status', p_action.status,
    'action_version', p_action.action_version,
    'origin', p_action.origin,
    'note', p_action.note,
    'completed_at', p_action.completed_at,
    'created_at', p_action.created_at,
    'updated_at', p_action.updated_at
  );
$$;

create or replace function public.leadflow_action_command_replay_v1(p_key text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select result
  from public.lead_follow_up_action_commands
  where idempotency_key = p_key;
$$;

create or replace function public.create_lead_follow_up_action_v1(
  p_lead_id uuid,
  p_action_type public.next_action_type,
  p_scheduled_for timestamptz,
  p_note text default null,
  p_idempotency_key text default null,
  p_action_id uuid default null,
  p_expected_action_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  action_lead_id uuid;
  action_row public.lead_follow_up_actions;
  prior_scheduled_for timestamptz;
  next_version bigint;
  command text;
  result jsonb;
  event_type text;
  event_payload jsonb;
  event_identity jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_scheduled_for is null then
    raise exception using errcode = '22023', message = 'SCHEDULED_FOR_REQUIRED';
  end if;
  if p_note is not null and length(btrim(p_note)) > 240 then
    raise exception using errcode = '22023', message = 'ACTION_NOTE_TOO_LONG';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  result := public.leadflow_action_command_replay_v1(p_idempotency_key);
  if result is not null then
    return result || jsonb_build_object('replayed', true);
  end if;

  -- Every action command locks the lead before the action row.
  select * into lead_row
  from public.leads
  where id = p_lead_id
    and deleted_at is null
    and user_id = owner_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  if p_action_id is null then
    command := 'CREATE';
    insert into public.lead_follow_up_actions (
      lead_id, action_type, scheduled_for, status, action_version, origin, note
    ) values (
      p_lead_id, p_action_type, p_scheduled_for, 'PENDING', 1, 'MANUAL', nullif(btrim(p_note), '')
    ) returning * into action_row;
    event_type := 'next_action_created';
    event_payload := jsonb_build_object(
      'lead_id', action_row.lead_id,
      'action_type', action_row.action_type,
      'scheduled_for', action_row.scheduled_for,
      'origin', action_row.origin
    );
    event_identity := jsonb_build_array(jsonb_build_object('name', 'action_id', 'value', action_row.id));
  else
    command := 'POSTPONE';
    select * into action_row
    from public.lead_follow_up_actions
    where id = p_action_id and lead_id = p_lead_id
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'ACTION_NOT_FOUND';
    end if;
    if action_row.status not in ('PENDING', 'POSTPONED') then
      raise exception using errcode = '40901', message = 'ACTION_NOT_OPEN';
    end if;
    if p_expected_action_version is null or action_row.action_version <> p_expected_action_version then
      result := jsonb_build_object(
        'status', 'STALE_ACTION',
        'replayed', false,
        'action', public.leadflow_action_json_v1(action_row)
      );
      insert into public.lead_follow_up_action_commands (idempotency_key, lead_id, action_id, command, result)
      values (p_idempotency_key, p_lead_id, action_row.id, command, result);
      return result;
    end if;
    prior_scheduled_for := action_row.scheduled_for;
    next_version := action_row.action_version + 1;
    update public.lead_follow_up_actions
    set scheduled_for = p_scheduled_for,
        status = 'POSTPONED',
        action_version = next_version,
        completed_at = null,
        note = coalesce(nullif(btrim(p_note), ''), note)
    where id = action_row.id
    returning * into action_row;
    event_type := 'next_action_postponed';
    event_payload := jsonb_build_object(
      'lead_id', action_row.lead_id,
      'action_id', action_row.id,
      'prior_scheduled_for', prior_scheduled_for,
      'new_scheduled_for', action_row.scheduled_for
    );
    event_identity := jsonb_build_array(
      jsonb_build_object('name', 'aggregate_type', 'value', 'FOLLOW_UP_ACTION'),
      jsonb_build_object('name', 'aggregate_id', 'value', action_row.id),
      jsonb_build_object('name', 'aggregate_version', 'value', action_row.action_version)
    );
  end if;

  update public.leads
  set conversation_state = 'WAITING_CUSTOMER'
  where id = lead_row.id;

  perform public.leadflow_require_event_append_v1(jsonb_build_object(
    'event_type', event_type,
    'schema_version', 1,
    'occurred_at', now(),
    'source', 'PWA',
    'actor_kind', 'ADVISOR',
    'actor_id', owner_id,
    'correlation_id', gen_random_uuid(),
    'idempotency_key', p_idempotency_key,
    'result', 'APPLIED',
    'aggregate_type', case when event_type = 'next_action_created' then null else 'FOLLOW_UP_ACTION' end,
    'aggregate_id', case when event_type = 'next_action_created' then null else action_row.id end,
    'aggregate_version', case when event_type = 'next_action_created' then null else action_row.action_version end,
    'payload', event_payload,
    'identity_components', event_identity
  ));

  result := jsonb_build_object(
    'status', case when command = 'CREATE' then 'INSERTED' else 'POSTPONED' end,
    'replayed', false,
    'action', public.leadflow_action_json_v1(action_row)
  );
  insert into public.lead_follow_up_action_commands (idempotency_key, lead_id, action_id, command, result)
  values (p_idempotency_key, p_lead_id, action_row.id, command, result);
  return result;
end;
$$;

create or replace function public.transition_lead_follow_up_action_v1(
  p_action_id uuid,
  p_status public.follow_up_action_status,
  p_expected_action_version bigint,
  p_scheduled_for timestamptz default null,
  p_note text default null,
  p_idempotency_key text default null,
  p_cancel_reason text default 'ADVISOR_COMMAND'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  action_row public.lead_follow_up_actions;
  prior_scheduled_for timestamptz;
  command text;
  event_type text;
  event_payload jsonb;
  event_identity jsonb;
  result jsonb;
  next_version bigint;
  action_lead_id uuid;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_status not in ('DONE', 'IGNORED', 'POSTPONED', 'CANCELED') then
    raise exception using errcode = '22023', message = 'ACTION_TRANSITION_INVALID';
  end if;
  if p_status = 'POSTPONED' and p_scheduled_for is null then
    raise exception using errcode = '22023', message = 'SCHEDULED_FOR_REQUIRED';
  end if;
  if p_note is not null and length(btrim(p_note)) > 240 then
    raise exception using errcode = '22023', message = 'ACTION_NOTE_TOO_LONG';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  result := public.leadflow_action_command_replay_v1(p_idempotency_key);
  if result is not null then
    return result || jsonb_build_object('replayed', true);
  end if;

  select lead_id into action_lead_id
  from public.lead_follow_up_actions
  where id = p_action_id;
  if action_lead_id is null then
    raise exception using errcode = '22023', message = 'ACTION_NOT_FOUND';
  end if;
  select * into lead_row
  from public.leads
  where id = action_lead_id
    and deleted_at is null
    and user_id = owner_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;
  select * into action_row
  from public.lead_follow_up_actions
  where id = p_action_id and lead_id = lead_row.id
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'ACTION_NOT_FOUND';
  end if;

  if action_row.action_version <> p_expected_action_version then
    result := jsonb_build_object('status', 'STALE_ACTION', 'replayed', false, 'action', public.leadflow_action_json_v1(action_row));
    insert into public.lead_follow_up_action_commands (idempotency_key, lead_id, action_id, command, result)
    values (p_idempotency_key, action_row.lead_id, action_row.id, upper(p_status::text), result);
    return result;
  end if;

  if action_row.status not in ('PENDING', 'POSTPONED') then
    result := jsonb_build_object('status', 'IDEMPOTENT_REPLAY', 'replayed', false, 'action', public.leadflow_action_json_v1(action_row));
    insert into public.lead_follow_up_action_commands (idempotency_key, lead_id, action_id, command, result)
    values (p_idempotency_key, action_row.lead_id, action_row.id, upper(p_status::text), result);
    return result;
  end if;

  prior_scheduled_for := action_row.scheduled_for;
  next_version := action_row.action_version + 1;
  update public.lead_follow_up_actions
  set status = p_status,
      scheduled_for = coalesce(p_scheduled_for, scheduled_for),
      action_version = next_version,
      completed_at = case when p_status = 'POSTPONED' then null else now() end,
      note = coalesce(nullif(btrim(p_note), ''), note)
  where id = action_row.id
  returning * into action_row;

  command := case p_status when 'DONE' then 'DONE' when 'IGNORED' then 'IGNORE' when 'POSTPONED' then 'POSTPONE' else 'CANCEL' end;
  event_type := case p_status when 'DONE' then 'next_action_done' when 'IGNORED' then 'next_action_ignored' when 'POSTPONED' then 'next_action_postponed' else 'next_action_canceled' end;
  event_payload := case p_status
    when 'DONE' then jsonb_build_object('lead_id', action_row.lead_id, 'action_id', action_row.id, 'action_type', action_row.action_type, 'origin', 'MANUAL_CONFIRMATION')
    when 'IGNORED' then jsonb_build_object('lead_id', action_row.lead_id, 'action_id', action_row.id, 'action_type', action_row.action_type)
    when 'POSTPONED' then jsonb_build_object('lead_id', action_row.lead_id, 'action_id', action_row.id, 'prior_scheduled_for', prior_scheduled_for, 'new_scheduled_for', action_row.scheduled_for)
    else jsonb_build_object('lead_id', action_row.lead_id, 'action_id', action_row.id, 'reason', p_cancel_reason)
  end;
  event_identity := jsonb_build_array(
    jsonb_build_object('name', 'aggregate_type', 'value', 'FOLLOW_UP_ACTION'),
    jsonb_build_object('name', 'aggregate_id', 'value', action_row.id),
    jsonb_build_object('name', 'aggregate_version', 'value', action_row.action_version)
  );

  perform public.leadflow_require_event_append_v1(jsonb_build_object(
    'event_type', event_type,
    'schema_version', 1,
    'occurred_at', now(),
    'source', 'PWA',
    'actor_kind', 'ADVISOR',
    'actor_id', owner_id,
    'correlation_id', gen_random_uuid(),
    'idempotency_key', p_idempotency_key,
    'result', 'APPLIED',
    'aggregate_type', 'FOLLOW_UP_ACTION',
    'aggregate_id', action_row.id,
    'aggregate_version', action_row.action_version,
    'payload', event_payload,
    'identity_components', event_identity
  ));

  result := jsonb_build_object('status', p_status::text, 'replayed', false, 'action', public.leadflow_action_json_v1(action_row));
  insert into public.lead_follow_up_action_commands (idempotency_key, lead_id, action_id, command, result)
  values (p_idempotency_key, action_row.lead_id, action_row.id, command, result);
  return result;
end;
$$;

revoke all on function public.leadflow_action_owner_v1() from public, anon, authenticated;
revoke all on function public.leadflow_action_json_v1(public.lead_follow_up_actions) from public, anon, authenticated;
revoke all on function public.leadflow_action_command_replay_v1(text) from public, anon, authenticated;
revoke all on function public.create_lead_follow_up_action_v1(uuid, public.next_action_type, timestamptz, text, text, uuid, bigint) from public, anon;
revoke all on function public.transition_lead_follow_up_action_v1(uuid, public.follow_up_action_status, bigint, timestamptz, text, text, text) from public, anon;
grant execute on function public.create_lead_follow_up_action_v1(uuid, public.next_action_type, timestamptz, text, text, uuid, bigint) to authenticated;
grant execute on function public.transition_lead_follow_up_action_v1(uuid, public.follow_up_action_status, bigint, timestamptz, text, text, text) to authenticated;
