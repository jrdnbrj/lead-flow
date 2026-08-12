-- E6-S1 / E6-S2: one manual purchase-decision milestone per lead.

create table if not exists public.lead_milestones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  milestone_type text not null check (milestone_type = 'PURCHASE_DECISION'),
  recorded_at timestamptz not null default now(),
  origin text not null default 'MANUAL' check (origin = 'MANUAL'),
  created_at timestamptz not null default now(),
  unique (lead_id, milestone_type)
);

create index if not exists lead_milestones_lead_recorded_idx
  on public.lead_milestones (lead_id, recorded_at desc);

update public.leadflow_event_registry
set emit_status = 'ENABLED', updated_at = now()
where event_type = 'purchase_decision_recorded';

alter table public.lead_milestones enable row level security;

drop policy if exists lead_milestones_owner_read on public.lead_milestones;
create policy lead_milestones_owner_read on public.lead_milestones
  for select to authenticated
  using (exists (
    select 1 from public.leads
    where leads.id = lead_milestones.lead_id
      and leads.user_id = auth.uid()
  ));

create or replace function public.record_purchase_decision_v1(
  p_lead_id uuid,
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
  recorded_at timestamptz := coalesce(p_recorded_at, now());
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'LEAD_REQUIRED';
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
    return jsonb_build_object('status', 'REPLAYED', 'replayed', true, 'milestone', jsonb_build_object(
      'id', milestone_row.id, 'lead_id', milestone_row.lead_id,
      'milestone_type', milestone_row.milestone_type, 'recorded_at', milestone_row.recorded_at,
      'origin', milestone_row.origin
    ));
  end if;

  insert into public.lead_milestones (lead_id, milestone_type, recorded_at, origin)
  values (p_lead_id, 'PURCHASE_DECISION', recorded_at, 'MANUAL')
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
      'origin', milestone_row.origin
    ));
end;
$$;

revoke all on function public.record_purchase_decision_v1(uuid, text, timestamptz) from public, anon;
grant execute on function public.record_purchase_decision_v1(uuid, text, timestamptz) to authenticated;
