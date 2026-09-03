-- Allow First Contact to contain the mandatory message without requiring a
-- photo and/or technical sheet for every model. E1 remains the sole
-- scheduling authority; this only relaxes the resource projection contract.
begin;

do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('public.request_first_contact_v2(uuid, text, jsonb, jsonb, text)'::regprocedure)
    into function_definition;

  if function_definition is null then
    raise exception using errcode = '42883', message = 'FIRST_CONTACT_V2_FUNCTION_NOT_FOUND';
  end if;
  if function_definition not like '%jsonb_array_length(p_items) not in (3, 5, 7)%'
     or function_definition not like '%photo_count not between 1 and 3%'
     or function_definition not like '%sheet_count not between 1 and 3%'
     or function_definition not like '%photo_count <> sheet_count%' then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_V2_EXPECTED_RESOURCE_GUARDS_NOT_FOUND';
  end if;

  updated_definition := replace(function_definition,
    'jsonb_array_length(p_items) not in (3, 5, 7)',
    'jsonb_array_length(p_items) between 1 and 7');
  updated_definition := replace(updated_definition,
    'message_count <> 1 or photo_count not between 1 and 3 or sheet_count not between 1 and 3 or photo_count <> sheet_count',
    'message_count <> 1 or photo_count not between 0 and 3 or sheet_count not between 0 and 3');

  if updated_definition = function_definition
     or updated_definition like '%jsonb_array_length(p_items) not in (3, 5, 7)%'
     or updated_definition like '%photo_count <> sheet_count%' then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_V2_RESOURCE_GUARDS_NOT_UPDATED';
  end if;

  execute updated_definition;
end;
$$;

commit;
