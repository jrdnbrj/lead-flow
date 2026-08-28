-- E5: close the race between Push materialization and an E1 action mutation.
-- A delivery is only eligible for provider IO after the authoritative action
-- is re-read and its version/status/schedule still match the projection.

create or replace function public.claim_push_delivery_v1(
  p_delivery_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.push_deliveries;
  action_row public.lead_follow_up_actions;
  lead_deleted_at timestamptz;
begin
  select * into delivery_row
  from public.push_deliveries
  where id = p_delivery_id
  for update;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if delivery_row.status <> 'SCHEDULED' then
    return jsonb_build_object('status', delivery_row.status);
  end if;

  select a.*
  into action_row
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
    update public.push_deliveries
    set status = 'CANCELED',
        provider_status = 'CANCELED_STALE_ACTION',
        updated_at = p_now
    where id = delivery_row.id
      and status = 'SCHEDULED';
    return jsonb_build_object('status', 'CANCELED', 'reason', 'STALE_ACTION');
  end if;

  update public.push_deliveries
  set status = 'CLAIMED',
      claimed_at = p_now,
      updated_at = p_now
  where id = delivery_row.id
    and status = 'SCHEDULED';

  if not found then
    return jsonb_build_object('status', 'CLAIM_LOST');
  end if;

  return jsonb_build_object('status', 'CLAIMED');
end;
$$;

revoke all on function public.claim_push_delivery_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_push_delivery_v1(uuid, timestamptz) to service_role;

comment on function public.claim_push_delivery_v1(uuid, timestamptz)
is 'Atomically claims a due Push projection only when the authoritative E1 action is still current and eligible.';

create or replace function public.revalidate_push_delivery_v1(
  p_delivery_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_row public.push_deliveries;
  action_row public.lead_follow_up_actions;
  lead_deleted_at timestamptz;
begin
  select * into delivery_row
  from public.push_deliveries
  where id = p_delivery_id
    and status = 'CLAIMED'
  for update;

  if not found then
    return jsonb_build_object('status', 'FENCE_FAILED', 'reason', 'DELIVERY_NOT_CLAIMED');
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
    update public.push_deliveries
    set status = 'CANCELED',
        provider_status = 'CANCELED_STALE_ACTION_BEFORE_IO',
        updated_at = p_now
    where id = delivery_row.id
      and status = 'CLAIMED';
    return jsonb_build_object('status', 'CANCELED', 'reason', 'STALE_ACTION_BEFORE_IO');
  end if;

  return jsonb_build_object('status', 'READY_FOR_IO');
end;
$$;

revoke all on function public.revalidate_push_delivery_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.revalidate_push_delivery_v1(uuid, timestamptz) to service_role;

comment on function public.revalidate_push_delivery_v1(uuid, timestamptz)
is 'Revalidates a claimed Push projection immediately before provider IO against the authoritative E1 action.';
