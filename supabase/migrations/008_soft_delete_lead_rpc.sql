create or replace function public.soft_delete_lead(p_lead_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_at_value timestamptz := now();
begin
  update public.leads
  set deleted_at = deleted_at_value,
      conversation_state = 'CLOSED',
      next_action_at = null,
      next_action_type = null
  where id = p_lead_id
    and deleted_at is null
    and (user_id is null or user_id = auth.uid());

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

revoke all on function public.soft_delete_lead(uuid) from public;
grant execute on function public.soft_delete_lead(uuid) to anon, authenticated;

comment on function public.soft_delete_lead(uuid) is
  'Soft-deletes an owned LeadFlow lead and cancels its pending reminders.';
