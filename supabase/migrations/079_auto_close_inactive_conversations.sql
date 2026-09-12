-- Automatically close stale active conversations when no follow-up remains open.
-- The existing internal scheduler invokes this maintenance operation; it does
-- not send WhatsApp and does not mutate follow-up actions.

begin;

create or replace function public.auto_close_inactive_conversations_v1(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  closed_count integer := 0;
begin
  select advisor_user_id
    into owner_id
  from public.leadflow_installation
  where singleton = true;

  if owner_id is null then
    raise exception 'LEADFLOW_INSTALLATION_OWNER_MISSING';
  end if;

  -- Scheduling commands lock the lead before the action row. Keep this same
  -- order so a new action cannot race past the open-action check.
  for lead_row in
    select *
    from public.leads
    where user_id = owner_id
      and deleted_at is null
      and conversation_state = 'ACTIVE'
      and last_activity_at is not null
      and last_activity_at <= p_now - interval '5 days'
    order by id
    for update
  loop
    if not exists (
      select 1
      from public.lead_follow_up_actions action_row
      where action_row.lead_id = lead_row.id
        and action_row.status in ('PENDING', 'POSTPONED')
    ) then
      update public.leads
      set conversation_state = 'CLOSED'
      where id = lead_row.id
        and user_id = owner_id
        and deleted_at is null
        and conversation_state = 'ACTIVE'
        and last_activity_at is not null
        and last_activity_at <= p_now - interval '5 days';

      if found then
        closed_count := closed_count + 1;
      end if;
    end if;
  end loop;

  return closed_count;
end;
$$;

revoke all on function public.auto_close_inactive_conversations_v1(timestamptz) from public, anon, authenticated;
grant execute on function public.auto_close_inactive_conversations_v1(timestamptz) to service_role;

comment on function public.auto_close_inactive_conversations_v1(timestamptz)
is 'Closes ACTIVE conversations after five days without activity only when no PENDING or POSTPONED follow-up action exists.';

commit;
