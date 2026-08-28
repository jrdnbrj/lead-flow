-- E3 runtime repair: keep the multi-vehicle request function compatible with
-- the canonical one-argument event append helper.
--
-- Migration 052 inherited an older call shape where identity_components was
-- passed as two additional SQL arguments. The current append helper receives
-- the complete event envelope as one jsonb argument. This overload adapts the
-- old call shape without changing the canonical helper or historical data.

create or replace function public.append_leadflow_event_v1(
  p_event jsonb,
  p_identity_key text,
  p_identity_components jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_identity_key <> 'identity_components' or jsonb_typeof(p_identity_components) <> 'array' then
    raise exception using errcode = '22023', message = 'IDENTITY_COMPONENTS_INVALID';
  end if;

  return public.append_leadflow_event_v1(
    p_event || jsonb_build_object('identity_components', p_identity_components)
  );
end;
$$;

revoke all on function public.append_leadflow_event_v1(jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_leadflow_event_v1(jsonb, text, jsonb) to service_role;
