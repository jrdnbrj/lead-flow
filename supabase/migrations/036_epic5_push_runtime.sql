-- E5 real Web Push runtime. Additive; E1 remains the action authority.
alter table public.external_effects drop constraint if exists external_effects_effect_kind_check;
alter table public.external_effects add constraint external_effects_effect_kind_check check (effect_kind in ('WHATSAPP_FIRST_CONTACT', 'WEB_PUSH'));
alter table public.external_effects drop constraint if exists external_effects_provider_check;
alter table public.external_effects add constraint external_effects_provider_check check (provider in ('EVOLUTION', 'WEB_PUSH'));

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  subscription_generation bigint not null default 1 check (subscription_generation > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INVALIDATED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidated_at timestamptz,
  unique (user_id, endpoint)
);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  action_id uuid not null references public.lead_follow_up_actions(id) on delete cascade,
  action_version bigint not null,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  subscription_generation bigint not null,
  effect_id uuid not null unique references public.external_effects(id) on delete restrict,
  lead_name text not null,
  action_type public.next_action_type not null,
  scheduled_for timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','CLAIMED','GENERATED','ACCEPTED','FAILED','UNKNOWN','CANCELED')),
  provider_status text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (action_id, action_version, subscription_id, subscription_generation)
);

create index if not exists push_deliveries_due_idx on public.push_deliveries (status, scheduled_for);

create or replace function public.materialize_push_deliveries_v1(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path = public
as $$
declare created_count integer := 0; action_row record; subscription_row record; effect_id uuid;
begin
  for action_row in
    select a.id, a.lead_id, a.action_version, a.scheduled_for, l.user_id, l.full_name, a.action_type
    from public.lead_follow_up_actions a join public.leads l on l.id=a.lead_id
    where a.status in ('PENDING','POSTPONED') and a.scheduled_for <= p_now and l.deleted_at is null
  loop
    for subscription_row in select id, subscription_generation from public.push_subscriptions where user_id=action_row.user_id and status='ACTIVE' loop
      insert into public.external_effects(user_id, lead_id, effect_kind, provider, business_key, state)
      values(action_row.user_id, action_row.lead_id, 'WEB_PUSH', 'WEB_PUSH',
        action_row.id::text || ':' || action_row.action_version::text || ':' || subscription_row.id::text || ':' || subscription_row.subscription_generation::text, 'READY')
      on conflict (user_id, effect_kind, business_key) do update set updated_at=now()
      returning id into effect_id;
      insert into public.push_deliveries(user_id, lead_id, action_id, action_version, subscription_id, subscription_generation, effect_id, lead_name, action_type, scheduled_for)
      values(action_row.user_id, action_row.lead_id, action_row.id, action_row.action_version, subscription_row.id, subscription_row.subscription_generation, effect_id, action_row.full_name, action_row.action_type, action_row.scheduled_for)
      on conflict (action_id, action_version, subscription_id, subscription_generation) do nothing;
      if found then created_count := created_count + 1; end if;
    end loop;
  end loop;
  return created_count;
end; $$;

revoke all on function public.materialize_push_deliveries_v1(timestamptz) from public, anon, authenticated;

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions, public.push_deliveries from anon, authenticated;

drop policy if exists push_subscriptions_owner on public.push_subscriptions;
create policy push_subscriptions_owner on public.push_subscriptions for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_deliveries_owner on public.push_deliveries;
create policy push_deliveries_owner on public.push_deliveries for select to authenticated
using (user_id = auth.uid());

create or replace function public.upsert_push_subscription_v1(
  p_endpoint text, p_p256dh text, p_auth text
) returns public.push_subscriptions
language plpgsql security definer set search_path = public, auth
as $$
declare owner_id uuid; row public.push_subscriptions;
begin
  owner_id := auth.uid();
  if owner_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if length(p_endpoint) not between 20 and 2048 or length(p_p256dh) < 16 or length(p_auth) < 8 then
    raise exception using errcode = '22023', message = 'PUSH_SUBSCRIPTION_INVALID';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, subscription_generation, status, invalidated_at)
  values(owner_id, p_endpoint, p_p256dh, p_auth, 1, 'ACTIVE', null)
  on conflict (user_id, endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    subscription_generation = public.push_subscriptions.subscription_generation + 1,
    status = 'ACTIVE', invalidated_at = null, updated_at = now()
  returning * into row;
  return row;
end; $$;

create or replace function public.invalidate_push_subscription_v1(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth
as $$ begin
  update public.push_subscriptions set status='INVALIDATED', invalidated_at=now(), updated_at=now()
  where id=p_subscription_id and user_id=auth.uid(); return found;
end; $$;

grant execute on function public.upsert_push_subscription_v1(text,text,text) to authenticated;
grant execute on function public.invalidate_push_subscription_v1(uuid) to authenticated;

comment on table public.push_deliveries is 'Web Push projection of E1 actions; never an action state machine.';
