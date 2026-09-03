-- Correct the request guard introduced by migration 066. The valid range is
-- 1 through 7 items; only values outside that range must be rejected.
begin;

do $migration$
declare
  function_definition text;
  updated_definition text;
  invalid_guard constant text := $guard$jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) between 1 and 7$guard$;
  valid_guard constant text := $guard$jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 7$guard$;
begin
  select pg_get_functiondef('public.request_first_contact_v2(uuid, text, jsonb, jsonb, text)'::regprocedure)
    into function_definition;

  if function_definition is null then
    raise exception using errcode = '42883', message = 'FIRST_CONTACT_V2_FUNCTION_NOT_FOUND';
  end if;
  if function_definition not like '%' || invalid_guard || '%' then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_V2_INVALID_GUARD_NOT_FOUND';
  end if;

  updated_definition := replace(function_definition, invalid_guard, valid_guard);
  if updated_definition = function_definition or updated_definition like '%' || invalid_guard || '%' then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_V2_GUARD_NOT_UPDATED';
  end if;

  execute updated_definition;
end;
$migration$;

commit;
