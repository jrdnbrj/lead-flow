-- Forward-only correction for environments where 075 was already applied.
-- Replaces only the milestone mutators; tables, grants and data stay unchanged.

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
  if auth.uid() is null or owner_id is null or auth.uid() <> owner_id then
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
  if auth.uid() is null or owner_id is null or auth.uid() <> owner_id then
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
