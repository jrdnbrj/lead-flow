-- WhatsApp reminder companion for E1.
-- E1 remains the only scheduling/business authority. This table is an
-- isolated delivery projection for the second, advisor-only WhatsApp number.

begin;

alter table public.external_effects drop constraint if exists external_effects_effect_kind_check;
alter table public.external_effects add constraint external_effects_effect_kind_check
  check (effect_kind in ('WHATSAPP_FIRST_CONTACT', 'WEB_PUSH', 'WHATSAPP_REMINDER'));

create table if not exists public.whatsapp_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  action_id uuid not null references public.lead_follow_up_actions(id) on delete cascade,
  action_version bigint not null check (action_version > 0),
  effect_id uuid not null unique references public.external_effects(id) on delete restrict,
  destination_id text not null check (length(btrim(destination_id)) between 3 and 80),
  evolution_instance text not null check (length(btrim(evolution_instance)) between 1 and 100),
  recipient text not null check (recipient ~ '^[0-9]{7,15}$'),
  lead_name text not null,
  lead_phone text not null,
  car_models text[] not null default '{}',
  action_type public.next_action_type not null,
  scheduled_for timestamptz not null,
  note text,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'CLAIMED', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'CANCELED')),
  attempt_no integer not null default 0 check (attempt_no >= 0),
  claim_token_digest text check (claim_token_digest is null or claim_token_digest ~ '^[0-9a-f]{64}$'),
  provider_message_id text,
  provider_status text,
  cancellation_reason text,
  claimed_at timestamptz,
  io_started_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_id, action_version, user_id, destination_id)
);

create index if not exists whatsapp_reminder_deliveries_due_idx
  on public.whatsapp_reminder_deliveries (status, scheduled_for);

create index if not exists whatsapp_reminder_deliveries_action_idx
  on public.whatsapp_reminder_deliveries (action_id, action_version desc);

alter table public.whatsapp_reminder_deliveries enable row level security;
revoke all on public.whatsapp_reminder_deliveries from public, anon, authenticated;

-- The browser never reads or mutates the internal reminder ledger. The
-- authenticated server uses the service role for the RPCs below.

create or replace function public.materialize_whatsapp_reminder_deliveries_v1(
  p_destination_id text,
  p_evolution_instance text,
  p_recipient text,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  action_row record;
  effect_id uuid;
  created_count integer := 0;
begin
  if length(btrim(coalesce(p_destination_id, ''))) not between 3 and 80 then
    raise exception using errcode = '22023', message = 'WHATSAPP_REMINDER_DESTINATION_INVALID';
  end if;
  if length(btrim(coalesce(p_evolution_instance, ''))) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'WHATSAPP_REMINDER_INSTANCE_INVALID';
  end if;
  if coalesce(p_recipient, '') !~ '^[0-9]{7,15}$' then
    raise exception using errcode = '22023', message = 'WHATSAPP_REMINDER_RECIPIENT_INVALID';
  end if;

  select advisor_user_id into owner_id
  from public.leadflow_installation
  where singleton = true;
  if owner_id is null then
    raise exception using errcode = '42501', message = 'ADVISOR_BOOTSTRAP_MISSING';
  end if;

  for action_row in
    select
      a.id,
      a.lead_id,
      a.action_version,
      a.action_type,
      a.scheduled_for,
      a.note,
      l.user_id,
      l.full_name,
      l.phone,
      coalesce(nullif(l.car_models, '{}'::text[]), array[l.car_model]) as car_models
    from public.lead_follow_up_actions a
    join public.leads l on l.id = a.lead_id
    where l.user_id = owner_id
      and l.deleted_at is null
      and a.status in ('PENDING', 'POSTPONED')
      and a.scheduled_for <= p_now
    order by a.scheduled_for asc, a.created_at asc, a.id asc
  loop
    insert into public.external_effects (
      user_id, lead_id, effect_kind, provider, business_key, state
    ) values (
      action_row.user_id,
      action_row.lead_id,
      'WHATSAPP_REMINDER',
      'EVOLUTION',
      action_row.id::text || ':' || action_row.action_version::text || ':' || btrim(p_destination_id),
      'READY'
    )
    on conflict (lead_id, effect_kind, business_key)
    do update set updated_at = now()
    returning id into effect_id;

    insert into public.whatsapp_reminder_deliveries (
      user_id,
      lead_id,
      action_id,
      action_version,
      effect_id,
      destination_id,
      evolution_instance,
      recipient,
      lead_name,
      lead_phone,
      car_models,
      action_type,
      scheduled_for,
      note
    ) values (
      action_row.user_id,
      action_row.lead_id,
      action_row.id,
      action_row.action_version,
      effect_id,
      btrim(p_destination_id),
      btrim(p_evolution_instance),
      btrim(p_recipient),
      action_row.full_name,
      action_row.phone,
      action_row.car_models,
      action_row.action_type,
      action_row.scheduled_for,
      action_row.note
    )
    on conflict (action_id, action_version, user_id, destination_id) do nothing;

    if found then
      created_count := created_count + 1;
    end if;
  end loop;

  return created_count;
end;
$$;

create or replace function public.claim_whatsapp_reminder_delivery_v1(
  p_delivery_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.whatsapp_reminder_deliveries;
  action_row public.lead_follow_up_actions;
  effect_state text;
  lead_deleted_at timestamptz;
  claim_token_digest text;
  next_attempt integer;
begin
  select * into delivery_row
  from public.whatsapp_reminder_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if delivery_row.status <> 'SCHEDULED' then
    return jsonb_build_object('status', delivery_row.status, 'delivery_id', delivery_row.id);
  end if;

  select a.* into action_row
  from public.lead_follow_up_actions a
  join public.leads l on l.id = a.lead_id
  where a.id = delivery_row.action_id
  for update;

  if found then
    select l.deleted_at into lead_deleted_at
    from public.leads l
    where l.id = action_row.lead_id;
  end if;

  if not found
    or lead_deleted_at is not null
    or action_row.status not in ('PENDING', 'POSTPONED')
    or action_row.action_version <> delivery_row.action_version
    or action_row.scheduled_for <> delivery_row.scheduled_for
    or action_row.scheduled_for > p_now then
    update public.whatsapp_reminder_deliveries
    set status = 'CANCELED',
        cancellation_reason = 'STALE_ACTION',
        updated_at = p_now
    where id = delivery_row.id
      and status = 'SCHEDULED';
    return jsonb_build_object('status', 'CANCELED', 'reason', 'STALE_ACTION', 'delivery_id', delivery_row.id);
  end if;

  select state into effect_state
  from public.external_effects
  where id = delivery_row.effect_id
  for update;
  if effect_state is distinct from 'READY' then
    update public.whatsapp_reminder_deliveries
    set status = 'CANCELED',
        cancellation_reason = 'EFFECT_NOT_READY',
        updated_at = p_now
    where id = delivery_row.id
      and status = 'SCHEDULED';
    return jsonb_build_object('status', 'CANCELED', 'reason', 'EFFECT_NOT_READY', 'delivery_id', delivery_row.id);
  end if;

  next_attempt := delivery_row.attempt_no + 1;
  claim_token_digest := encode(digest(gen_random_uuid()::text || delivery_row.id::text, 'sha256'), 'hex');

  insert into public.external_effect_attempts (
    effect_id, attempt_no, claim_token_digest
  ) values (
    delivery_row.effect_id, next_attempt, claim_token_digest
  );

  update public.external_effects
  set state = 'CLAIMED',
      current_attempt_no = next_attempt,
      effect_version = effect_version + 1,
      updated_at = p_now
  where id = delivery_row.effect_id;

  update public.whatsapp_reminder_deliveries
  set status = 'CLAIMED',
      attempt_no = next_attempt,
      claim_token_digest = claim_token_digest,
      claimed_at = p_now,
      updated_at = p_now
  where id = delivery_row.id
    and status = 'SCHEDULED';

  if not found then
    return jsonb_build_object('status', 'CLAIM_LOST', 'delivery_id', delivery_row.id);
  end if;

  return jsonb_build_object(
    'status', 'CLAIMED',
    'delivery_id', delivery_row.id,
    'effect_id', delivery_row.effect_id,
    'attempt_no', next_attempt,
    'claim_token_digest', claim_token_digest
  );
end;
$$;

create or replace function public.revalidate_whatsapp_reminder_delivery_v1(
  p_delivery_id uuid,
  p_attempt_no integer,
  p_claim_token_digest text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.whatsapp_reminder_deliveries;
  action_row public.lead_follow_up_actions;
  lead_deleted_at timestamptz;
begin
  if p_claim_token_digest is null or p_claim_token_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'FENCE_FAILED', 'reason', 'CLAIM_TOKEN_INVALID');
  end if;

  select * into delivery_row
  from public.whatsapp_reminder_deliveries
  where id = p_delivery_id
    and status = 'CLAIMED'
    and attempt_no = p_attempt_no
    and claim_token_digest = p_claim_token_digest
  for update;

  if not found then
    return jsonb_build_object('status', 'FENCE_FAILED', 'reason', 'DELIVERY_NOT_CLAIMED');
  end if;

  select a.* into action_row
  from public.lead_follow_up_actions a
  join public.leads l on l.id = a.lead_id
  where a.id = delivery_row.action_id
  for update;

  if found then
    select l.deleted_at into lead_deleted_at
    from public.leads l
    where l.id = action_row.lead_id;
  end if;

  if not found
    or lead_deleted_at is not null
    or action_row.status not in ('PENDING', 'POSTPONED')
    or action_row.action_version <> delivery_row.action_version
    or action_row.scheduled_for <> delivery_row.scheduled_for
    or action_row.scheduled_for > p_now then
    update public.whatsapp_reminder_deliveries
    set status = 'CANCELED',
        cancellation_reason = 'STALE_ACTION_BEFORE_IO',
        updated_at = p_now
    where id = delivery_row.id
      and status = 'CLAIMED';
    return jsonb_build_object('status', 'CANCELED', 'reason', 'STALE_ACTION_BEFORE_IO', 'delivery_id', delivery_row.id);
  end if;

  update public.whatsapp_reminder_deliveries
  set io_started_at = p_now,
      updated_at = p_now
  where id = delivery_row.id
    and status = 'CLAIMED'
    and attempt_no = p_attempt_no
    and claim_token_digest = p_claim_token_digest;

  update public.external_effect_attempts
  set request_started_at = p_now
  where effect_id = delivery_row.effect_id
    and attempt_no = p_attempt_no
    and claim_token_digest = p_claim_token_digest;

  return jsonb_build_object('status', 'READY_FOR_IO', 'delivery_id', delivery_row.id);
end;
$$;

create or replace function public.record_whatsapp_reminder_result_v1(
  p_delivery_id uuid,
  p_attempt_no integer,
  p_claim_token_digest text,
  p_result_kind text,
  p_provider_message_id text default null,
  p_provider_status text default null,
  p_recorded_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.whatsapp_reminder_deliveries;
begin
  if p_result_kind not in ('ACCEPTED', 'FAILED', 'UNKNOWN') then
    raise exception using errcode = '22023', message = 'WHATSAPP_REMINDER_RESULT_INVALID';
  end if;
  if p_result_kind = 'ACCEPTED' and nullif(btrim(p_provider_message_id), '') is null then
    raise exception using errcode = '22023', message = 'WHATSAPP_REMINDER_PROVIDER_ID_REQUIRED';
  end if;

  select * into delivery_row
  from public.whatsapp_reminder_deliveries
  where id = p_delivery_id
    and status = 'CLAIMED'
    and attempt_no = p_attempt_no
    and claim_token_digest = p_claim_token_digest
  for update;

  if not found then
    return jsonb_build_object('status', 'RESULT_NOT_APPLIED', 'reason', 'DELIVERY_FENCE_FAILED');
  end if;

  update public.whatsapp_reminder_deliveries
  set status = p_result_kind,
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      provider_status = nullif(btrim(p_provider_status), ''),
      sent_at = case when p_result_kind = 'ACCEPTED' then p_recorded_at else null end,
      updated_at = p_recorded_at
  where id = delivery_row.id;

  update public.external_effects
  set state = p_result_kind,
      updated_at = p_recorded_at
  where id = delivery_row.effect_id;

  update public.external_effect_attempts
  set completed_at = p_recorded_at,
      result_kind = p_result_kind,
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      provider_status = nullif(btrim(p_provider_status), '')
  where effect_id = delivery_row.effect_id
    and attempt_no = p_attempt_no
    and claim_token_digest = p_claim_token_digest;

  return jsonb_build_object(
    'status', p_result_kind,
    'delivery_id', delivery_row.id,
    'effect_id', delivery_row.effect_id,
    'attempt_no', p_attempt_no,
    'provider_message_id', nullif(btrim(p_provider_message_id), '')
  );
end;
$$;

revoke all on function public.materialize_whatsapp_reminder_deliveries_v1(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_reminder_delivery_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.revalidate_whatsapp_reminder_delivery_v1(uuid, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_whatsapp_reminder_result_v1(uuid, integer, text, text, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.materialize_whatsapp_reminder_deliveries_v1(text, text, text, timestamptz) to service_role;
grant execute on function public.claim_whatsapp_reminder_delivery_v1(uuid, timestamptz) to service_role;
grant execute on function public.revalidate_whatsapp_reminder_delivery_v1(uuid, integer, text, timestamptz) to service_role;
grant execute on function public.record_whatsapp_reminder_result_v1(uuid, integer, text, text, text, text, timestamptz) to service_role;

comment on table public.whatsapp_reminder_deliveries is 'Server-only WhatsApp companion projection of E1 actions for the advisor reminder number.';
comment on column public.whatsapp_reminder_deliveries.action_version is 'Immutable E1 version captured by this logical reminder identity.';
comment on column public.whatsapp_reminder_deliveries.claim_token_digest is 'Server-side fence for the current provider attempt; never exposed to the browser.';

commit;
