-- E4-S5b: application-role append-only enforcement and atomic append helper.

create or replace function public.leadflow_events_mutation_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'LEADFLOW_EVENTS_APPEND_ONLY';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists leadflow_events_no_update_delete on public.leadflow_events;
create trigger leadflow_events_no_update_delete
before update or delete on public.leadflow_events
for each row execute function public.leadflow_events_mutation_guard_v1();

create or replace function public.leadflow_require_event_append_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare result jsonb; error_state text; error_message text;
begin
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

revoke all on function public.leadflow_events_mutation_guard_v1() from public, anon, authenticated;
revoke all on function public.leadflow_require_event_append_v1(jsonb) from public, anon, authenticated;
grant execute on function public.leadflow_require_event_append_v1(jsonb) to service_role;
