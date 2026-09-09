-- Postcompra v1: caso operativo 1:1 y checklist manual de 13 milestones.
-- Forward-only. No modifica lead_milestones/PURCHASE_DECISION ni hace backfill.

create table if not exists public.purchase_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create table if not exists public.purchase_case_milestones (
  id uuid primary key default gen_random_uuid(),
  purchase_case_id uuid not null references public.purchase_cases(id) on delete cascade,
  milestone_type text not null check (milestone_type in (
    'INVOICED',
    'FONDO_VIAL',
    'RAMV_REQUESTED',
    'RAMV_UPLOADED',
    'ORDERS_AVAILABLE',
    'ORDERS_SENT',
    'PAYMENTS_RECEIVED',
    'SENT_TO_REGISTRATION',
    'REGISTERED',
    'ACCESSORIES_COMPLETE',
    'VEHICLE_REQUESTED',
    'DELIVERY_PREPARATION',
    'DELIVERED'
  )),
  position smallint not null check (position between 1 and 13),
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'REVERTED')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete restrict,
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_case_id, milestone_type),
  unique (purchase_case_id, position),
  check (
    (status = 'PENDING' and completed_at is null and completed_by is null and reverted_at is null and reverted_by is null)
    or (status = 'COMPLETED' and completed_at is not null and completed_by is not null)
    or (status = 'REVERTED' and completed_at is not null and completed_by is not null and reverted_at is not null and reverted_by is not null)
  )
);

create index if not exists purchase_cases_lead_idx
  on public.purchase_cases (lead_id);

create index if not exists purchase_case_milestones_case_position_idx
  on public.purchase_case_milestones (purchase_case_id, position);

alter table public.purchase_cases enable row level security;
alter table public.purchase_case_milestones enable row level security;

drop policy if exists purchase_cases_owner_read on public.purchase_cases;
create policy purchase_cases_owner_read on public.purchase_cases
  for select to authenticated
  using (exists (
    select 1
    from public.leads
    where leads.id = purchase_cases.lead_id
      and leads.user_id = auth.uid()
      and leads.deleted_at is null
  ));

drop policy if exists purchase_case_milestones_owner_read on public.purchase_case_milestones;
create policy purchase_case_milestones_owner_read on public.purchase_case_milestones
  for select to authenticated
  using (exists (
    select 1
    from public.purchase_cases
    join public.leads on leads.id = purchase_cases.lead_id
    where purchase_cases.id = purchase_case_milestones.purchase_case_id
      and leads.user_id = auth.uid()
      and leads.deleted_at is null
  ));

revoke all on table public.purchase_cases from public, anon, authenticated;
grant select on table public.purchase_cases to authenticated;
revoke all on table public.purchase_case_milestones from public, anon, authenticated;
grant select on table public.purchase_case_milestones to authenticated;

create or replace function public.purchase_case_read_model_v1(p_case_id uuid)
returns jsonb
language sql
security definer
set search_path = public, auth, extensions
as $$
  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', cases.id,
      'lead_id', cases.lead_id,
      'created_at', cases.created_at,
      'created_by', cases.created_by,
      'updated_at', cases.updated_at
    ),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', milestones.id,
        'purchase_case_id', milestones.purchase_case_id,
        'milestone_type', milestones.milestone_type,
        'position', milestones.position,
        'status', milestones.status,
        'completed_at', milestones.completed_at,
        'completed_by', milestones.completed_by,
        'reverted_at', milestones.reverted_at,
        'reverted_by', milestones.reverted_by,
        'created_at', milestones.created_at,
        'updated_at', milestones.updated_at
      ) order by milestones.position)
      from public.purchase_case_milestones milestones
      where milestones.purchase_case_id = cases.id
    ), '[]'::jsonb),
    'completed_count', (
      select count(*)
      from public.purchase_case_milestones milestones
      where milestones.purchase_case_id = cases.id
        and milestones.status = 'COMPLETED'
    ),
    'total', 13
  )
  from public.purchase_cases cases
  where cases.id = p_case_id;
$$;

create or replace function public.purchase_case_seed_milestones_v1(p_case_id uuid)
returns void
language sql
security definer
set search_path = public, auth, extensions
as $$
  insert into public.purchase_case_milestones (purchase_case_id, milestone_type, position)
  values
    (p_case_id, 'INVOICED', 1),
    (p_case_id, 'FONDO_VIAL', 2),
    (p_case_id, 'RAMV_REQUESTED', 3),
    (p_case_id, 'RAMV_UPLOADED', 4),
    (p_case_id, 'ORDERS_AVAILABLE', 5),
    (p_case_id, 'ORDERS_SENT', 6),
    (p_case_id, 'PAYMENTS_RECEIVED', 7),
    (p_case_id, 'SENT_TO_REGISTRATION', 8),
    (p_case_id, 'REGISTERED', 9),
    (p_case_id, 'ACCESSORIES_COMPLETE', 10),
    (p_case_id, 'VEHICLE_REQUESTED', 11),
    (p_case_id, 'DELIVERY_PREPARATION', 12),
    (p_case_id, 'DELIVERED', 13)
  on conflict do nothing;
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
  if auth.uid() is null or owner_id is null or auth.uid() <> owner_id then
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
  if auth.uid() is null or owner_id is null or auth.uid() <> owner_id then
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

revoke all on function public.purchase_case_read_model_v1(uuid) from public, anon, authenticated;
revoke all on function public.purchase_case_seed_milestones_v1(uuid) from public, anon, authenticated;
revoke all on function public.get_purchase_case_v1(uuid) from public, anon;
revoke all on function public.ensure_purchase_case_v1(uuid) from public, anon;
revoke all on function public.complete_purchase_milestone_v1(uuid, text, text) from public, anon;
revoke all on function public.revert_purchase_milestone_v1(uuid, text, text) from public, anon;
grant execute on function public.get_purchase_case_v1(uuid) to authenticated;
grant execute on function public.ensure_purchase_case_v1(uuid) to authenticated;
grant execute on function public.complete_purchase_milestone_v1(uuid, text, text) to authenticated;
grant execute on function public.revert_purchase_milestone_v1(uuid, text, text) to authenticated;
