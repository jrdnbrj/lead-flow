-- Reversible purchase decision state on the existing single milestone row.
-- Forward-only: historical rows are active purchases and no new historical
-- events or milestone rows are created by a revert/reactivation.

alter table public.lead_milestones
  add column if not exists purchase_status text not null default 'PURCHASED';

update public.lead_milestones
set purchase_status = 'PURCHASED'
where purchase_status is null;

alter table public.lead_milestones
  alter column purchase_status set default 'PURCHASED',
  alter column purchase_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_milestones'::regclass
      and conname = 'lead_milestones_purchase_status_check'
  ) then
    alter table public.lead_milestones
      add constraint lead_milestones_purchase_status_check
      check (purchase_status in ('PURCHASED', 'REVERTED'));
  end if;
end;
$$;

create index if not exists lead_milestones_purchase_status_idx
  on public.lead_milestones (milestone_type, purchase_status, lead_id);

-- New v2 marks and reactivates the same row while retaining buyer identity.
create or replace function public.record_purchase_decision_v2(
  p_lead_id uuid,
  p_national_id text,
  p_idempotency_key text default null,
  p_recorded_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  milestone_row public.lead_milestones;
  event_result jsonb;
  normalized_national_id text := nullif(btrim(p_national_id), '');
  recorded_at timestamptz := coalesce(p_recorded_at, now());
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'LEAD_REQUIRED';
  end if;
  if normalized_national_id is null or length(normalized_national_id) not between 5 and 30 or normalized_national_id !~ '^[0-9A-Za-z-]+$' then
    raise exception using errcode = '22023', message = 'BUYER_NATIONAL_ID_REQUIRED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'PURCHASE_DECISION_COMMAND_INPUT_REQUIRED';
  end if;
  if p_recorded_at is not null and p_recorded_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'PURCHASE_DECISION_TIMESTAMP_INVALID';
  end if;

  select * into lead_row
  from public.leads
  where id = p_lead_id and user_id = owner_id and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into milestone_row
  from public.lead_milestones
  where lead_id = p_lead_id and milestone_type = 'PURCHASE_DECISION'
  for update;
  if found then
    if milestone_row.purchase_status = 'REVERTED' then
      update public.lead_milestones
      set purchase_status = 'PURCHASED'
      where id = milestone_row.id
      returning * into milestone_row;

      return jsonb_build_object('status', 'REACTIVATED', 'replayed', false, 'milestone', jsonb_build_object(
        'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
        'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
        'origin', milestone_row.origin, 'purchase_status', milestone_row.purchase_status
      ));
    end if;

    return jsonb_build_object('status', 'REPLAYED', 'replayed', true, 'milestone', jsonb_build_object(
      'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
      'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
      'origin', milestone_row.origin, 'purchase_status', milestone_row.purchase_status
    ));
  end if;

  update public.leads
  set national_id = normalized_national_id
  where id = lead_row.id;

  insert into public.lead_milestones (lead_id, milestone_type, recorded_at, origin, buyer_national_id, purchase_status)
  values (p_lead_id, 'PURCHASE_DECISION', recorded_at, 'MANUAL', normalized_national_id, 'PURCHASED')
  returning * into milestone_row;

  event_result := public.append_leadflow_event_v1(jsonb_build_object(
    'event_type', 'purchase_decision_recorded',
    'schema_version', 1,
    'occurred_at', milestone_row.recorded_at,
    'source', 'PWA',
    'stage', 'PURCHASE',
    'actor_kind', 'ADVISOR',
    'actor_id', owner_id,
    'correlation_id', gen_random_uuid(),
    'idempotency_key', p_idempotency_key,
    'payload', jsonb_build_object('lead_id', milestone_row.lead_id, 'milestone_id', milestone_row.id, 'origin', 'MANUAL'),
    'identity_components', jsonb_build_array(jsonb_build_object('name', 'milestone_id', 'value', milestone_row.id))
  ));

  return jsonb_build_object('status', 'RECORDED', 'replayed', false,
    'event', event_result,
    'milestone', jsonb_build_object(
      'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
      'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
      'origin', milestone_row.origin, 'purchase_status', milestone_row.purchase_status
    ));
end;
$$;

create or replace function public.revert_purchase_decision_v1(
  p_lead_id uuid,
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
  milestone_row public.lead_milestones;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'LEAD_REQUIRED';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'PURCHASE_DECISION_COMMAND_INPUT_REQUIRED';
  end if;

  select * into lead_row
  from public.leads
  where id = p_lead_id and user_id = owner_id and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into milestone_row
  from public.lead_milestones
  where lead_id = p_lead_id and milestone_type = 'PURCHASE_DECISION'
  for update;
  if not found then
    return jsonb_build_object('status', 'NOT_PURCHASED', 'replayed', true, 'milestone', null);
  end if;

  if milestone_row.purchase_status = 'REVERTED' then
    return jsonb_build_object('status', 'ALREADY_REVERTED', 'replayed', true, 'milestone', jsonb_build_object(
      'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
      'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
      'origin', milestone_row.origin, 'purchase_status', milestone_row.purchase_status
    ));
  end if;

  update public.lead_milestones
  set purchase_status = 'REVERTED'
  where id = milestone_row.id
  returning * into milestone_row;

  return jsonb_build_object('status', 'REVERTED', 'replayed', false, 'milestone', jsonb_build_object(
    'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
    'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
    'origin', milestone_row.origin, 'purchase_status', milestone_row.purchase_status
  ));
end;
$$;

revoke all on function public.record_purchase_decision_v1(uuid, text, timestamptz) from public, anon;
grant execute on function public.record_purchase_decision_v1(uuid, text, timestamptz) to authenticated;
revoke all on function public.record_purchase_decision_v2(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.record_purchase_decision_v2(uuid, text, text, timestamptz) to authenticated;
revoke all on function public.revert_purchase_decision_v1(uuid, text) from public, anon;
grant execute on function public.revert_purchase_decision_v1(uuid, text) to authenticated;
