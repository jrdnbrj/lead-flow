-- E3 runtime fix: qualify replay projection columns in the request RPC.
-- The existing-operation branch must not collide with PL/pgSQL variables.

create or replace function public.request_first_contact_v1(
  p_lead_id uuid,
  p_configuration_digest text,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  lead_row public.leads;
  operation_row public.lead_contact_operations;
  item_input jsonb;
  item_row public.lead_contact_operation_items;
  effect_row public.external_effects;
  item_rows jsonb := '[]'::jsonb;
  event_result jsonb;
  item_key text;
  resource_kind text;
  resource_version text;
  availability text;
begin
  owner_id := public.leadflow_first_contact_owner_v1(p_lead_id);
  if p_configuration_digest is null or p_configuration_digest !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'CONFIGURATION_DIGEST_INVALID'; end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then raise exception using errcode = '22023', message = 'FIRST_CONTACT_COMMAND_INPUT_REQUIRED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) <> 3 then raise exception using errcode = '22023', message = 'FIRST_CONTACT_ITEMS_REQUIRED'; end if;
  if (select count(distinct value->>'item_key') from jsonb_array_elements(p_items)) <> 3 then raise exception using errcode = '22023', message = 'FIRST_CONTACT_ITEMS_DUPLICATED'; end if;
  if (select count(distinct value->>'resource_kind') from jsonb_array_elements(p_items)) <> 3 then raise exception using errcode = '22023', message = 'FIRST_CONTACT_RESOURCES_REQUIRED'; end if;

  select * into lead_row from public.leads where id = p_lead_id and user_id = owner_id and deleted_at is null for update;
  select * into operation_row from public.lead_contact_operations where lead_id = p_lead_id and operation_type = 'FIRST_CONTACT' for update;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'resource_kind', i.resource_kind, 'item_key', i.item_key, 'resource_version', i.resource_version, 'availability', i.availability, 'result', i.result, 'effect_id', i.effect_id, 'lead_message_id', i.lead_message_id, 'provider_message_id', i.provider_message_id) order by i.item_key), '[]'::jsonb) into item_rows from public.lead_contact_operation_items as i where i.operation_id = operation_row.id;
    return jsonb_build_object('status', 'REPLAYED', 'replayed', true, 'operation', jsonb_build_object('id', operation_row.id, 'lead_id', operation_row.lead_id, 'operation_type', operation_row.operation_type, 'operation_version', operation_row.operation_version, 'status', operation_row.status), 'items', item_rows);
  end if;

  insert into public.lead_contact_operations (lead_id, operation_type, configuration_digest)
  values (p_lead_id, 'FIRST_CONTACT', p_configuration_digest)
  returning * into operation_row;

  for item_input in select value from jsonb_array_elements(p_items) loop
    resource_kind := item_input->>'resource_kind';
    item_key := item_input->>'item_key';
    resource_version := item_input->>'resource_version';
    availability := item_input->>'availability';
    if resource_kind not in ('MESSAGE', 'PHOTOS', 'TECHNICAL_SHEET') or item_key is null or resource_version is null or availability not in ('AVAILABLE', 'NOT_AVAILABLE') then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_ITEM_INVALID';
    end if;
    insert into public.lead_contact_operation_items (operation_id, resource_kind, item_key, resource_version, availability, result)
    values (operation_row.id, resource_kind, item_key, resource_version, availability, case when availability = 'NOT_AVAILABLE' then 'NOT_AVAILABLE' else null end)
    returning * into item_row;
    if availability = 'AVAILABLE' then
      insert into public.external_effects (user_id, lead_id, effect_kind, business_key, item_id)
      values (owner_id, p_lead_id, 'WHATSAPP_FIRST_CONTACT', operation_row.id::text || ':' || item_key || ':' || resource_version, item_row.id)
      returning * into effect_row;
      update public.lead_contact_operation_items set effect_id = effect_row.id where id = item_row.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'resource_kind', i.resource_kind, 'item_key', i.item_key, 'resource_version', i.resource_version, 'availability', i.availability, 'result', i.result, 'effect_id', i.effect_id, 'lead_message_id', i.lead_message_id, 'provider_message_id', i.provider_message_id) order by i.item_key), '[]'::jsonb) into item_rows from public.lead_contact_operation_items i where i.operation_id = operation_row.id;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type', 'first_contact_requested', 'schema_version', 1, 'occurred_at', now(), 'source', 'PWA', 'stage', 'FIRST_CONTACT', 'actor_kind', 'ADVISOR', 'actor_id', owner_id, 'correlation_id', gen_random_uuid(), 'idempotency_key', p_idempotency_key, 'payload', jsonb_build_object('lead_id', p_lead_id, 'requested_resources', (select jsonb_agg(value->>'resource_kind') from jsonb_array_elements(p_items)), 'configuration_digest', p_configuration_digest), 'identity_components', jsonb_build_array(jsonb_build_object('name', 'operation_id', 'value', operation_row.id))));
  return jsonb_build_object('status', 'CREATED', 'replayed', false, 'event', event_result, 'operation', jsonb_build_object('id', operation_row.id, 'lead_id', operation_row.lead_id, 'operation_type', operation_row.operation_type, 'operation_version', operation_row.operation_version, 'status', operation_row.status), 'items', item_rows);
end;
$$;
