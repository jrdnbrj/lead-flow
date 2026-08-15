-- E2 runtime fix: provider message IDs are provider-defined safe text, not UUIDs.
-- Keep the contract compatible with Evolution identifiers and existing data.

update public.leadflow_event_registry
set payload_contract = jsonb_set(
  jsonb_set(payload_contract, '{types,provider_message_id}', '"safe_text"'::jsonb, true),
  '{fields,provider_message_id,type}', '"safe_text"'::jsonb, true
),
updated_at = now()
where event_type = 'inbound_message_received'
  and schema_version = 1;

do $$
declare contract_type text;
begin
  select payload_contract #>> '{types,provider_message_id}'
    into contract_type
  from public.leadflow_event_registry
  where event_type = 'inbound_message_received'
    and schema_version = 1;

  if contract_type is distinct from 'safe_text' then
    raise exception 'E2_PROVIDER_MESSAGE_ID_CONTRACT_NOT_RECONCILED';
  end if;
end $$;
