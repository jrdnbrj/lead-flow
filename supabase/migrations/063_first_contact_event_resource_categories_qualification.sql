-- Qualify the derived event column name. In PL/pgSQL, the unqualified
-- resource_kind conflicted with the function variable of the same name.
begin;

do $$
declare
  function_definition text;
  original_expression constant text := 'jsonb_agg\(resource_kind[[:space:]]+order[[:space:]]+by[[:space:]]+resource_kind\)';
  qualified_expression constant text := 'jsonb_agg(resource_categories.resource_kind order by resource_categories.resource_kind)';
begin
  select pg_get_functiondef('public.request_first_contact_v2(uuid, text, jsonb, jsonb, text)'::regprocedure)
    into function_definition;

  if function_definition is null then
    raise exception using errcode = '42883', message = 'FIRST_CONTACT_V2_FUNCTION_NOT_FOUND';
  end if;
  if function_definition !~* original_expression then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_V2_EXPECTED_EVENT_EXPRESSION_NOT_FOUND';
  end if;

  execute regexp_replace(function_definition, original_expression, qualified_expression, 'gi');
end;
$$;

commit;
