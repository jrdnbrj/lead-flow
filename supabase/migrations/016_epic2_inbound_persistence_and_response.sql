-- E2-S5 / E2-S6: inbound persistence and response-action convergence.
-- Remote execution is intentionally deferred in the implementation phase.
-- The governed inbound insert intentionally leaves raw_payload null (raw_payload).

alter type public.next_action_type add value if not exists 'RESPONSE';

alter table public.lead_follow_up_actions
  add column if not exists source_message_id uuid references public.lead_messages(id) on delete set null;

alter table public.lead_messages
  add column if not exists inbound_classification text
  check (inbound_classification is null or inbound_classification in ('NO_SUGGESTION', 'PENDING', 'REVIEW'));

alter table public.lead_follow_up_action_commands
  drop constraint if exists lead_follow_up_action_commands_command_check;
alter table public.lead_follow_up_action_commands
  add constraint lead_follow_up_action_commands_command_check
  check (command in ('CREATE', 'POSTPONE', 'DONE', 'IGNORE', 'CANCEL', 'INBOUND_RESPONSE'));

update public.leadflow_event_registry
set emit_status = 'ENABLED', updated_at = now()
where event_type in ('inbound_message_received', 'inbound_lead_match_ambiguous', 'response_action_upserted');

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
    'source_message_id', p_action.source_message_id,
    'note', p_action.note,
    'completed_at', p_action.completed_at,
    'created_at', p_action.created_at,
    'updated_at', p_action.updated_at
  );
$$;

create or replace function public.persist_inbound_message_v1(
  p_lead_id uuid,
  p_evolution_instance text,
  p_provider_message_id text,
  p_phone text,
  p_body text,
  p_created_at timestamptz,
  p_classification text,
  p_association_status text,
  p_match_ambiguous boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  message_row public.lead_messages;
  existing_message public.lead_messages;
  correlation_id uuid := gen_random_uuid();
  identity_key text;
begin
  select advisor_user_id into owner_id from public.leadflow_installation where singleton = true;
  if owner_id is null then raise exception using errcode = '42501', message = 'INSTALLATION_OWNER_MISSING'; end if;
  if p_lead_id is null then return jsonb_build_object('status', 'NO_MATCH', 'replayed', false, 'persisted', false); end if;
  if nullif(btrim(p_evolution_instance), '') is null or nullif(btrim(p_provider_message_id), '') is null then
    raise exception using errcode = '22023', message = 'PROVIDER_IDENTITY_REQUIRED';
  end if;
  if p_classification not in ('NO_SUGGESTION', 'PENDING', 'REVIEW') then
    raise exception using errcode = '22023', message = 'CLASSIFICATION_INVALID';
  end if;
  if p_association_status not in ('MATCHED', 'AMBIGUOUS') then
    raise exception using errcode = '22023', message = 'ASSOCIATION_STATUS_INVALID';
  end if;

  select * into lead_row from public.leads
  where id = p_lead_id and user_id = owner_id and deleted_at is null
  for update;
  if not found then raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED'; end if;

  select * into existing_message from public.lead_messages
  where evolution_instance = btrim(p_evolution_instance)
    and provider_message_id = btrim(p_provider_message_id)
  limit 1;
  if found then
    return jsonb_build_object('status', 'REPLAYED', 'replayed', true, 'persisted', true, 'message_id', existing_message.id, 'lead_id', existing_message.lead_id);
  end if;

  insert into public.lead_messages (lead_id, evolution_instance, provider_message_id, direction, status, body, phone, created_at, raw_payload, inbound_classification)
  values (p_lead_id, btrim(p_evolution_instance), btrim(p_provider_message_id), 'INBOUND', 'RECEIVED', left(p_body, 5000), p_phone, coalesce(p_created_at, now()), null, p_classification)
  returning * into message_row;

  if p_match_ambiguous then
    identity_key := btrim(p_evolution_instance) || ':' || btrim(p_provider_message_id);
    perform public.leadflow_require_event_append_v1(jsonb_build_object(
      'event_type', 'inbound_lead_match_ambiguous', 'schema_version', 1,
      'occurred_at', coalesce(p_created_at, now()), 'source', 'WEBHOOK', 'stage', 'INBOUND',
      'actor_kind', 'WEBHOOK', 'correlation_id', correlation_id,
      'idempotency_key', identity_key || ':ambiguous', 'result', 'APPLIED', 'payload', '{}'::jsonb,
      'identity_components', jsonb_build_array(
        jsonb_build_object('name', 'evolution_instance_canonical', 'value', btrim(p_evolution_instance)),
        jsonb_build_object('name', 'fingerprint_kind', 'value', 'PROVIDER_MESSAGE_ID'),
        jsonb_build_object('name', 'fingerprint_value', 'value', btrim(p_provider_message_id))
      )
    ));
  end if;

  perform public.leadflow_require_event_append_v1(jsonb_build_object(
    'event_type', 'inbound_message_received', 'schema_version', 1,
    'occurred_at', coalesce(p_created_at, now()), 'source', 'WEBHOOK', 'stage', 'INBOUND',
    'actor_kind', 'WEBHOOK', 'correlation_id', correlation_id,
    'idempotency_key', btrim(p_evolution_instance) || ':' || btrim(p_provider_message_id),
    'result', 'APPLIED', 'payload', jsonb_build_object(
      'lead_id', message_row.lead_id, 'provider_message_id', message_row.provider_message_id,
      'association_status', p_association_status, 'classification', p_classification
    ),
    'identity_components', jsonb_build_array(jsonb_build_object('name', 'message_id', 'value', message_row.id))
  ));

  return jsonb_build_object('status', 'PERSISTED', 'replayed', false, 'persisted', true, 'message_id', message_row.id, 'lead_id', message_row.lead_id);
end;
$$;

create or replace function public.upsert_inbound_response_action_v1(
  p_lead_id uuid,
  p_source_message_id uuid,
  p_classification text,
  p_scheduled_for timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  action_row public.lead_follow_up_actions;
  prior_action public.lead_follow_up_actions;
  result jsonb;
  deduplicated boolean := false;
  review_label text;
  correlation_id uuid := gen_random_uuid();
  event_identity jsonb;
begin
  select advisor_user_id into owner_id from public.leadflow_installation where singleton = true;
  if owner_id is null then raise exception using errcode = '42501', message = 'INSTALLATION_OWNER_MISSING'; end if;
  if p_classification not in ('PENDING', 'REVIEW') then raise exception using errcode = '22023', message = 'RESPONSE_CLASSIFICATION_NOT_ACTIONABLE'; end if;
  if p_scheduled_for is null or length(btrim(p_idempotency_key)) not between 16 and 200 then raise exception using errcode = '22023', message = 'RESPONSE_COMMAND_INPUT_REQUIRED'; end if;
  result := public.leadflow_action_command_replay_v1(p_idempotency_key);
  if result is not null then return result || jsonb_build_object('replayed', true); end if;

  select * into lead_row from public.leads where id = p_lead_id and user_id = owner_id and deleted_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED'; end if;
  if not exists (select 1 from public.lead_messages where id = p_source_message_id and lead_id = p_lead_id and direction = 'INBOUND') then
    raise exception using errcode = '22023', message = 'SOURCE_MESSAGE_NOT_FOUND';
  end if;
  select * into prior_action from public.lead_follow_up_actions
  where lead_id = p_lead_id and action_type = 'RESPONSE' and status in ('PENDING', 'POSTPONED')
  order by scheduled_for asc, created_at asc, id asc limit 1 for update;

  if found then
    action_row := prior_action;
    deduplicated := true;
    update public.lead_follow_up_actions
    set source_message_id = p_source_message_id,
        scheduled_for = case when prior_action.status = 'POSTPONED' then prior_action.scheduled_for else p_scheduled_for end,
        action_version = prior_action.action_version + 1,
        updated_at = now()
    where id = prior_action.id
    returning * into action_row;
  else
    insert into public.lead_follow_up_actions (lead_id, action_type, scheduled_for, status, action_version, origin, source_message_id)
    values (p_lead_id, 'RESPONSE', p_scheduled_for, 'PENDING', 1, 'SUGGESTED', p_source_message_id)
    returning * into action_row;
  end if;

  update public.leads set conversation_state = 'WAITING_CUSTOMER' where id = p_lead_id;
  review_label := case when p_classification = 'REVIEW' then 'Revisar' else null end;
  event_identity := jsonb_build_array(
    jsonb_build_object('name', 'aggregate_type', 'value', 'FOLLOW_UP_ACTION'),
    jsonb_build_object('name', 'aggregate_id', 'value', action_row.id),
    jsonb_build_object('name', 'aggregate_version', 'value', action_row.action_version)
  );
  perform public.leadflow_require_event_append_v1(jsonb_build_object(
    'event_type', 'response_action_upserted', 'schema_version', 1,
    'occurred_at', now(), 'source', 'WEBHOOK', 'stage', 'INBOUND', 'actor_kind', 'WEBHOOK',
    'correlation_id', correlation_id, 'idempotency_key', p_idempotency_key, 'result', 'APPLIED',
    'aggregate_type', 'FOLLOW_UP_ACTION', 'aggregate_id', action_row.id, 'aggregate_version', action_row.action_version,
    'payload', jsonb_strip_nulls(jsonb_build_object('lead_id', p_lead_id, 'action_id', action_row.id, 'scheduled_for', action_row.scheduled_for, 'classification', p_classification, 'deduplicated', deduplicated, 'review_label', review_label)),
    'identity_components', event_identity
  ));
  result := jsonb_build_object('status', case when deduplicated then 'UPDATED' else 'INSERTED' end, 'replayed', false, 'action', public.leadflow_action_json_v1(action_row));
  insert into public.lead_follow_up_action_commands (idempotency_key, lead_id, action_id, command, result)
  values (p_idempotency_key, p_lead_id, action_row.id, 'INBOUND_RESPONSE', result);
  return result;
end;
$$;

revoke all on function public.persist_inbound_message_v1(uuid, text, text, text, text, timestamptz, text, text, boolean) from public, anon, authenticated;
revoke all on function public.upsert_inbound_response_action_v1(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.persist_inbound_message_v1(uuid, text, text, text, text, timestamptz, text, text, boolean) to service_role;
grant execute on function public.upsert_inbound_response_action_v1(uuid, uuid, text, timestamptz, text) to service_role;
