-- E1-S5: additive action identity and lifecycle metadata.
-- Runtime migration execution is intentionally deferred for this phase.
alter table public.lead_follow_up_actions
  add column if not exists action_version bigint not null default 1,
  add column if not exists origin text not null default 'MANUAL';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lead_follow_up_actions_origin_check') then
    alter table public.lead_follow_up_actions
      add constraint lead_follow_up_actions_origin_check
      check (origin in ('MANUAL', 'SUGGESTED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lead_follow_up_actions_action_version_check') then
    alter table public.lead_follow_up_actions
      add constraint lead_follow_up_actions_action_version_check
      check (action_version > 0);
  end if;
end;
$$;

create index if not exists lead_follow_up_actions_version_idx
on public.lead_follow_up_actions (lead_id, action_version desc);

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
  order by scheduled_for asc, created_at asc, id asc
  limit 1;

  update public.leads
  set next_action_at = next_action.scheduled_for,
      next_action_type = next_action.action_type
  where id = target_lead_id;

  return coalesce(new, old);
end;
$$;
