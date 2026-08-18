-- E4 Phase B: finalize the single-advisor ownership boundary.
-- Additive and intentionally scoped to the approved one-advisor installation.
begin;

select pg_advisory_xact_lock(hashtextextended('leadflow_auth_cutover', 0));

do $$
declare
  owner_id uuid;
  approved_advisor_user_id constant uuid := '1331ad98-0430-4025-88d6-9c1f68083f68';
begin
  select advisor_user_id into owner_id
  from public.leadflow_installation
  where singleton = true;

  if owner_id is null or not exists (select 1 from auth.users where id = approved_advisor_user_id) then
    raise exception 'E4-S8 requires one valid singleton advisor';
  end if;

  update public.leads set user_id = approved_advisor_user_id
  where user_id is null or user_id = owner_id;
  update public.leadflow_settings set user_id = approved_advisor_user_id
  where user_id is null or user_id = owner_id;
  update public.leadflow_installation
  set advisor_user_id = approved_advisor_user_id, updated_at = now()
  where singleton = true;
end;
$$;

alter table public.leadflow_installation enable row level security;
revoke all on public.leadflow_installation from public, anon, authenticated;

create or replace function public.leadflow_installation_immutable_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'LEADFLOW_INSTALLATION_IMMUTABLE';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists leadflow_installation_immutable on public.leadflow_installation;
create trigger leadflow_installation_immutable
before update or delete on public.leadflow_installation
for each row execute function public.leadflow_installation_immutable_guard_v1();

drop policy if exists leads_select_anonymous on public.leads;
drop policy if exists leads_insert_anonymous on public.leads;
drop policy if exists leads_update_anonymous on public.leads;
drop policy if exists lead_messages_select_anonymous on public.lead_messages;
drop policy if exists lead_messages_insert_anonymous on public.lead_messages;
drop policy if exists lead_messages_update_anonymous on public.lead_messages;
drop policy if exists lead_follow_up_actions_select_anonymous on public.lead_follow_up_actions;
drop policy if exists lead_follow_up_actions_insert_anonymous on public.lead_follow_up_actions;
drop policy if exists lead_follow_up_actions_update_anonymous on public.lead_follow_up_actions;
drop policy if exists lead_follow_up_actions_delete_anonymous on public.lead_follow_up_actions;

drop policy if exists leadflow_settings_select_owner on public.leadflow_settings;
drop policy if exists leadflow_settings_update_owner on public.leadflow_settings;
create policy leadflow_settings_select_owner on public.leadflow_settings
for select to authenticated using (user_id = auth.uid());
create policy leadflow_settings_update_owner on public.leadflow_settings
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.soft_delete_lead(p_lead_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_at_value timestamptz := now();
  owner_id uuid;
begin
  select advisor_user_id into owner_id
  from public.leadflow_installation
  where singleton = true;

  update public.leads
  set deleted_at = deleted_at_value,
      conversation_state = 'CLOSED',
      next_action_at = null,
      next_action_type = null
  where id = p_lead_id
    and deleted_at is null
    and user_id = owner_id;

  if not found then
    return true;
  end if;

  update public.lead_follow_up_actions
  set status = 'CANCELED',
      completed_at = deleted_at_value,
      note = 'Cancelada porque el contacto fue eliminado.'
  where lead_id = p_lead_id
    and status in ('PENDING', 'POSTPONED');

  return true;
end;
$$;

revoke all on function public.soft_delete_lead(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_lead(uuid) to service_role;

comment on table public.leadflow_installation is 'E4-S8 singleton identity authority; direct replacement is forbidden after Phase B.';
comment on function public.soft_delete_lead(uuid) is 'Server-only soft delete for the singleton advisor; cancels pending reminders.';

commit;
