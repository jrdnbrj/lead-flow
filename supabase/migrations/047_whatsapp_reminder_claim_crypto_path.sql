-- Fix the server-only WhatsApp reminder claim function to resolve pgcrypto
-- helpers in Supabase's extensions schema. Historical migration 045 remains
-- immutable; this is a forward-only function replacement.

begin;

create or replace function public.claim_whatsapp_reminder_delivery_v1(
  p_delivery_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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

revoke all on function public.claim_whatsapp_reminder_delivery_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_reminder_delivery_v1(uuid, timestamptz) to service_role;

commit;
