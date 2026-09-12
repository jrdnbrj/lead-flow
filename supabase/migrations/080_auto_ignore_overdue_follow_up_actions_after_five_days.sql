-- Follow-up maintenance: ignore pending reminders overdue by more than five days.
-- Migration 069 remains historical; this forward-only replacement updates the
-- function used by the existing Push and WhatsApp reminder schedulers.

begin;

create or replace function public.auto_ignore_expired_follow_up_actions_v1(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ignored_count integer := 0;
begin
  update public.lead_follow_up_actions
  set status = 'IGNORED',
      completed_at = p_now,
      note = case
        when note is null or btrim(note) = '' then 'Ignorada automáticamente por vencer hace más de 5 días.'
        else note || ' · Ignorada automáticamente por vencer hace más de 5 días.'
      end,
      updated_at = p_now
  where status in ('PENDING', 'POSTPONED')
    and scheduled_for < p_now - interval '5 days';

  get diagnostics ignored_count = row_count;

  update public.push_deliveries
  set status = 'CANCELED',
      provider_status = 'CANCELED_ACTION_EXPIRED',
      updated_at = p_now
  where status in ('SCHEDULED', 'CLAIMED')
    and action_id in (
      select id
      from public.lead_follow_up_actions
      where status = 'IGNORED'
        and completed_at = p_now
    );

  update public.whatsapp_reminder_deliveries
  set status = 'CANCELED',
      cancellation_reason = 'ACTION_EXPIRED',
      updated_at = p_now
  where status in ('SCHEDULED', 'CLAIMED')
    and action_id in (
      select id
      from public.lead_follow_up_actions
      where status = 'IGNORED'
        and completed_at = p_now
    );

  return ignored_count;
end;
$$;

revoke all on function public.auto_ignore_expired_follow_up_actions_v1(timestamptz) from public, anon, authenticated;
grant execute on function public.auto_ignore_expired_follow_up_actions_v1(timestamptz) to service_role;

comment on function public.auto_ignore_expired_follow_up_actions_v1(timestamptz)
is 'Ignores pending follow-up actions more than 5 days overdue and cancels unaccepted Push/WhatsApp projections.';

commit;
