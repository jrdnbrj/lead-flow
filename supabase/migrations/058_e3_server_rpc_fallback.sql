-- E3 runtime compatibility: keep the browser-authenticated path intact while
-- allowing the already-authorized server action to complete when Supabase's
-- JWT validator rejects a freshly issued user token as being from the future.
-- The server-only path still resolves and verifies the installation owner.

create or replace function public.leadflow_first_contact_owner_v1(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid;
begin
  select advisor_user_id
    into owner_id
    from public.leadflow_installation
   where singleton = true
     and (advisor_user_id = auth.uid() or auth.role() = 'service_role');

  if owner_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if not exists (
    select 1
      from public.leads
     where id = p_lead_id
       and user_id = owner_id
       and deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;
  return owner_id;
end;
$$;

grant execute on function public.leadflow_first_contact_owner_v1(uuid) to service_role;
grant execute on function public.request_first_contact_v1(uuid, text, jsonb, text) to service_role;
grant execute on function public.claim_first_contact_effect_v1(uuid, text) to service_role;
grant execute on function public.begin_first_contact_effect_io_v1(uuid, integer, text, text) to service_role;
grant execute on function public.record_first_contact_effect_result_v1(uuid, integer, text, text, text, text, text) to service_role;
grant execute on function public.retry_first_contact_effect_v1(uuid, bigint, text) to service_role;
