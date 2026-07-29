do $$
begin
  create type public.follow_up_action_status as enum ('PENDING', 'DONE', 'POSTPONED', 'IGNORED', 'CANCELED');
exception when duplicate_object then null;
end $$;

create table if not exists public.lead_follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  action_type public.next_action_type not null,
  scheduled_for timestamptz not null,
  status public.follow_up_action_status not null default 'PENDING',
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_follow_up_actions_due_idx
on public.lead_follow_up_actions (status, scheduled_for)
where status in ('PENDING', 'POSTPONED');

create index if not exists lead_follow_up_actions_lead_idx
on public.lead_follow_up_actions (lead_id, scheduled_for desc);

create or replace function public.sync_lead_next_action_summary()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_lead_id uuid := coalesce(new.lead_id, old.lead_id);
  next_action record;
begin
  select scheduled_for, action_type
  into next_action
  from public.lead_follow_up_actions
  where lead_id = target_lead_id
    and status in ('PENDING', 'POSTPONED')
  order by scheduled_for asc, created_at asc
  limit 1;

  update public.leads
  set next_action_at = next_action.scheduled_for,
      next_action_type = next_action.action_type
  where id = target_lead_id;

  return coalesce(new, old);
end;
$$;

drop trigger if exists lead_follow_up_actions_sync_lead on public.lead_follow_up_actions;
create trigger lead_follow_up_actions_sync_lead
after insert or update of action_type, scheduled_for, status or delete
on public.lead_follow_up_actions
for each row execute function public.sync_lead_next_action_summary();

create or replace function public.touch_lead_follow_up_action_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lead_follow_up_actions_touch_updated_at on public.lead_follow_up_actions;
create trigger lead_follow_up_actions_touch_updated_at
before update on public.lead_follow_up_actions
for each row execute function public.touch_lead_follow_up_action_updated_at();

insert into public.lead_follow_up_actions (lead_id, action_type, scheduled_for, status, created_at)
select id, next_action_type, next_action_at, 'PENDING', coalesce(updated_at, now())
from public.leads
where next_action_at is not null
  and next_action_type is not null
  and not exists (
    select 1 from public.lead_follow_up_actions actions
    where actions.lead_id = leads.id
      and actions.scheduled_for = leads.next_action_at
  );

alter table public.lead_follow_up_actions enable row level security;

drop policy if exists "lead_follow_up_actions_select_own" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_select_own"
on public.lead_follow_up_actions for select to authenticated
using (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_follow_up_actions_insert_own" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_insert_own"
on public.lead_follow_up_actions for insert to authenticated
with check (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_follow_up_actions_update_own" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_update_own"
on public.lead_follow_up_actions for update to authenticated
using (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id = auth.uid()
))
with check (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_follow_up_actions_delete_own" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_delete_own"
on public.lead_follow_up_actions for delete to authenticated
using (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_follow_up_actions_select_anonymous" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_select_anonymous"
on public.lead_follow_up_actions for select to anon
using (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id is null
));

drop policy if exists "lead_follow_up_actions_insert_anonymous" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_insert_anonymous"
on public.lead_follow_up_actions for insert to anon
with check (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id is null
));

drop policy if exists "lead_follow_up_actions_update_anonymous" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_update_anonymous"
on public.lead_follow_up_actions for update to anon
using (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id is null
))
with check (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id is null
));

drop policy if exists "lead_follow_up_actions_delete_anonymous" on public.lead_follow_up_actions;
create policy "lead_follow_up_actions_delete_anonymous"
on public.lead_follow_up_actions for delete to anon
using (exists (
  select 1 from public.leads
  where leads.id = lead_follow_up_actions.lead_id
    and leads.user_id is null
));

comment on table public.lead_follow_up_actions is 'Multiple seller follow-up actions with explicit lifecycle and calendar-day reminders.';
