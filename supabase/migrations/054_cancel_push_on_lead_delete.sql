-- E5: cancel Push projections when their lead is soft-deleted.
-- Already ACCEPTED provider requests cannot be recalled from a device; this
-- closes the remaining local window for scheduled or claimed deliveries.

begin;

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

  update public.push_deliveries
  set status = 'CANCELED',
      provider_status = 'CANCELED_LEAD_DELETED',
      updated_at = deleted_at_value
  where lead_id = p_lead_id
    and status in ('SCHEDULED', 'CLAIMED');

  return true;
end;
$$;

revoke all on function public.soft_delete_lead(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_lead(uuid) to service_role;

comment on function public.soft_delete_lead(uuid)
is 'Server-only soft delete for the singleton advisor; cancels pending actions and unaccepted Push deliveries.';

commit;
