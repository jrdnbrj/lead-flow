-- E1-SCHEDULING: derive the event stage at the canonical append boundary.
-- Action command RPCs call this helper without duplicating the registry stage.
-- Keep an explicitly supplied stage strict: a mismatch must still fail.

create or replace function public.leadflow_require_event_append_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
  error_state text;
  error_message text;
  expected_stage text;
begin
  select allowed_stage
    into expected_stage
  from public.leadflow_event_registry
  where event_type = p_event->>'event_type'
    and schema_version = coalesce((p_event->>'schema_version')::smallint, 1);

  if expected_stage is null then
    raise exception using errcode = '22023', message = 'EVENT_TYPE_UNKNOWN';
  end if;

  if p_event ? 'stage' and p_event->>'stage' is distinct from expected_stage then
    raise exception using errcode = '22023', message = 'EVENT_STAGE_INVALID';
  end if;

  p_event := jsonb_set(p_event, '{stage}', to_jsonb(expected_stage), true);

  begin
    result := public.append_leadflow_event_v1(p_event);
  exception when others then
    get stacked diagnostics error_state = returned_sqlstate, error_message = message_text;
    raise exception using errcode = error_state, message = error_message || ':correlation_id=' || coalesce(p_event->>'correlation_id', 'missing');
  end;

  if result->>'status' not in ('APPENDED', 'REPLAYED') then
    raise exception using errcode = '40001', message = coalesce(result->>'status', 'EVENT_APPEND_FAILED') || ':correlation_id=' || coalesce(result->>'correlation_id', p_event->>'correlation_id', 'missing');
  end if;
  return result;
end;
$$;

revoke all on function public.leadflow_require_event_append_v1(jsonb) from public, anon, authenticated;
grant execute on function public.leadflow_require_event_append_v1(jsonb) to service_role;
