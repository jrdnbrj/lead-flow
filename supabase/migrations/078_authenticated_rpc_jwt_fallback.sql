-- Forward-only JWT timing recovery for authenticated server actions.
--
-- The application still tries the advisor JWT first. These grants only enable
-- the already-authorized Next.js server path after requireAdvisor() has passed.
-- Every function below re-checks the installation owner and lead ownership in
-- SQL. No tables or data are changed by this migration.

begin;

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

create or replace function public.get_purchase_case_v1(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  purchase_row public.lead_milestones;
  case_id uuid;
  model jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if auth.role() <> 'service_role' and (auth.uid() is null or owner_id is null or auth.uid() <> owner_id) then
    raise exception using errcode = '42501', message = 'ADVISOR_NOT_AUTHORIZED';
  end if;
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'LEAD_REQUIRED';
  end if;

  select * into lead_row
  from public.leads
  where id = p_lead_id
    and user_id = owner_id
    and deleted_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into purchase_row
  from public.lead_milestones
  where lead_id = p_lead_id
    and milestone_type = 'PURCHASE_DECISION';

  if not found then
    return jsonb_build_object('status', 'NOT_PURCHASED', 'purchase_status', null, 'case', null, 'milestones', '[]'::jsonb, 'completed_count', 0, 'total', 13);
  end if;

  select id into case_id
  from public.purchase_cases
  where lead_id = p_lead_id;

  if purchase_row.purchase_status = 'REVERTED' then
    if case_id is null then
      return jsonb_build_object('status', 'PAUSED', 'purchase_status', 'REVERTED', 'case', null, 'milestones', '[]'::jsonb, 'completed_count', 0, 'total', 13);
    end if;
    model := public.purchase_case_read_model_v1(case_id);
    return jsonb_build_object('status', 'PAUSED', 'purchase_status', 'REVERTED') || model;
  end if;

  if case_id is null then
    return jsonb_build_object('status', 'NOT_CREATED', 'purchase_status', 'PURCHASED', 'case', null, 'milestones', '[]'::jsonb, 'completed_count', 0, 'total', 13);
  end if;

  model := public.purchase_case_read_model_v1(case_id);
  return jsonb_build_object('status', 'READY', 'purchase_status', 'PURCHASED') || model;
end;
$$;

-- All post-purchase mutators acquire row locks in this order:
-- lead -> PURCHASE_DECISION -> purchase_case -> purchase_case_milestone.
create or replace function public.ensure_purchase_case_v1(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  purchase_row public.lead_milestones;
  case_row public.purchase_cases;
  created_case boolean := false;
  model jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if auth.role() <> 'service_role' and (auth.uid() is null or owner_id is null or auth.uid() <> owner_id) then
    raise exception using errcode = '42501', message = 'ADVISOR_NOT_AUTHORIZED';
  end if;
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'LEAD_REQUIRED';
  end if;

  select * into lead_row
  from public.leads
  where id = p_lead_id
    and user_id = owner_id
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into purchase_row
  from public.lead_milestones
  where lead_id = p_lead_id
    and milestone_type = 'PURCHASE_DECISION'
  for update;
  if not found or purchase_row.purchase_status <> 'PURCHASED' then
    raise exception using errcode = '42501', message = 'PURCHASE_NOT_ACTIVE';
  end if;

  select * into case_row
  from public.purchase_cases
  where lead_id = p_lead_id
  for update;

  if not found then
    insert into public.purchase_cases (lead_id, created_by)
    values (p_lead_id, owner_id)
    on conflict (lead_id) do nothing
    returning * into case_row;
    if found then
      created_case := true;
    else
      select * into case_row
      from public.purchase_cases
      where lead_id = p_lead_id
      for update;
    end if;
  end if;

  perform public.purchase_case_seed_milestones_v1(case_row.id);
  update public.purchase_cases set updated_at = now() where id = case_row.id;
  model := public.purchase_case_read_model_v1(case_row.id);
  return jsonb_build_object('status', 'READY', 'replayed', not created_case, 'purchase_status', 'PURCHASED') || model;
end;
$$;

create or replace function public.complete_purchase_milestone_v1(
  p_case_id uuid,
  p_milestone_type text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  target_lead_id uuid;
  case_row public.purchase_cases;
  lead_row public.leads;
  purchase_row public.lead_milestones;
  milestone_row public.purchase_case_milestones;
  model jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if auth.role() <> 'service_role' and (auth.uid() is null or owner_id is null or auth.uid() <> owner_id) then
    raise exception using errcode = '42501', message = 'ADVISOR_NOT_AUTHORIZED';
  end if;
  if p_case_id is null or p_milestone_type is null or p_milestone_type not in (
    'INVOICED', 'FONDO_VIAL', 'RAMV_REQUESTED', 'RAMV_UPLOADED',
    'ORDERS_AVAILABLE', 'ORDERS_SENT', 'PAYMENTS_RECEIVED',
    'SENT_TO_REGISTRATION', 'REGISTERED', 'ACCESSORIES_COMPLETE',
    'VEHICLE_REQUESTED', 'DELIVERY_PREPARATION', 'DELIVERED'
  ) then
    raise exception using errcode = '22023', message = 'MILESTONE_INPUT_INVALID';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'MILESTONE_COMMAND_INPUT_REQUIRED';
  end if;

  -- Resolve the immutable relationship without locking the case first.
  -- The mutating lock order is lead -> decision -> case -> milestone.
  select lead_id into target_lead_id
  from public.purchase_cases
  where id = p_case_id;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  select * into lead_row
  from public.leads
  where id = target_lead_id
  for update;
  if not found or lead_row.user_id <> owner_id or lead_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into purchase_row
  from public.lead_milestones
  where lead_id = lead_row.id and milestone_type = 'PURCHASE_DECISION'
  for update;
  if not found or purchase_row.purchase_status <> 'PURCHASED' then
    raise exception using errcode = '42501', message = 'PURCHASE_NOT_ACTIVE';
  end if;

  select * into case_row
  from public.purchase_cases
  where id = p_case_id
    and lead_id = lead_row.id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  select * into milestone_row
  from public.purchase_case_milestones
  where purchase_case_id = case_row.id and milestone_type = p_milestone_type
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'MILESTONE_NOT_FOUND';
  end if;
  if milestone_row.status = 'COMPLETED' then
    model := public.purchase_case_read_model_v1(case_row.id);
    return jsonb_build_object('status', 'REPLAYED', 'replayed', true, 'purchase_status', 'PURCHASED') || model;
  end if;

  update public.purchase_case_milestones
  set status = 'COMPLETED', completed_at = now(), completed_by = owner_id, updated_at = now()
  where id = milestone_row.id
  returning * into milestone_row;

  model := public.purchase_case_read_model_v1(case_row.id);
  return jsonb_build_object('status', 'COMPLETED', 'replayed', false, 'purchase_status', 'PURCHASED') || model;
end;
$$;

create or replace function public.revert_purchase_milestone_v1(
  p_case_id uuid,
  p_milestone_type text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  target_lead_id uuid;
  case_row public.purchase_cases;
  lead_row public.leads;
  purchase_row public.lead_milestones;
  milestone_row public.purchase_case_milestones;
  model jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if auth.role() <> 'service_role' and (auth.uid() is null or owner_id is null or auth.uid() <> owner_id) then
    raise exception using errcode = '42501', message = 'ADVISOR_NOT_AUTHORIZED';
  end if;
  if p_case_id is null or p_milestone_type is null or p_milestone_type not in (
    'INVOICED', 'FONDO_VIAL', 'RAMV_REQUESTED', 'RAMV_UPLOADED',
    'ORDERS_AVAILABLE', 'ORDERS_SENT', 'PAYMENTS_RECEIVED',
    'SENT_TO_REGISTRATION', 'REGISTERED', 'ACCESSORIES_COMPLETE',
    'VEHICLE_REQUESTED', 'DELIVERY_PREPARATION', 'DELIVERED'
  ) then
    raise exception using errcode = '22023', message = 'MILESTONE_INPUT_INVALID';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'MILESTONE_COMMAND_INPUT_REQUIRED';
  end if;

  -- Resolve the immutable relationship without locking the case first.
  -- The mutating lock order is lead -> decision -> case -> milestone.
  select lead_id into target_lead_id
  from public.purchase_cases
  where id = p_case_id;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  select * into lead_row
  from public.leads
  where id = target_lead_id
  for update;
  if not found or lead_row.user_id <> owner_id or lead_row.deleted_at is not null then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into purchase_row
  from public.lead_milestones
  where lead_id = lead_row.id and milestone_type = 'PURCHASE_DECISION'
  for update;
  if not found or purchase_row.purchase_status <> 'PURCHASED' then
    raise exception using errcode = '42501', message = 'PURCHASE_NOT_ACTIVE';
  end if;

  select * into case_row
  from public.purchase_cases
  where id = p_case_id
    and lead_id = lead_row.id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  select * into milestone_row
  from public.purchase_case_milestones
  where purchase_case_id = case_row.id and milestone_type = p_milestone_type
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'MILESTONE_NOT_FOUND';
  end if;
  if milestone_row.status = 'REVERTED' then
    model := public.purchase_case_read_model_v1(case_row.id);
    return jsonb_build_object('status', 'ALREADY_REVERTED', 'replayed', true, 'purchase_status', 'PURCHASED') || model;
  end if;
  if milestone_row.status <> 'COMPLETED' then
    raise exception using errcode = '22023', message = 'MILESTONE_NOT_COMPLETED';
  end if;

  update public.purchase_case_milestones
  set status = 'REVERTED', reverted_at = now(), reverted_by = owner_id, updated_at = now()
  where id = milestone_row.id
  returning * into milestone_row;

  model := public.purchase_case_read_model_v1(case_row.id);
  return jsonb_build_object('status', 'REVERTED', 'replayed', false, 'purchase_status', 'PURCHASED') || model;
end;
$$;

grant execute on function public.correct_inbound_response_v1(uuid, text, uuid, uuid, bigint, timestamptz, text) to service_role;
grant execute on function public.get_purchase_case_v1(uuid) to service_role;
grant execute on function public.ensure_purchase_case_v1(uuid) to service_role;
grant execute on function public.complete_purchase_milestone_v1(uuid, text, text) to service_role;
grant execute on function public.revert_purchase_milestone_v1(uuid, text, text) to service_role;

commit;
