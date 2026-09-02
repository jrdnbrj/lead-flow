-- E3 resource recovery: allow a previously unavailable photo or technical
-- sheet to become sendable once its catalog asset exists.
-- This never creates new historical operation items and never changes an
-- accepted effect.

begin;

create or replace function public.hydrate_first_contact_resource_v1(
  p_lead_id uuid,
  p_resource_kind text,
  p_item_key text,
  p_resource_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  operation_row public.lead_contact_operations;
  item_row public.lead_contact_operation_items;
  effect_row public.external_effects;
begin
  if p_resource_kind not in ('PHOTOS', 'TECHNICAL_SHEET')
     or nullif(btrim(p_item_key), '') is null
     or nullif(btrim(p_resource_version), '') is null then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_RESOURCE_INPUT_INVALID';
  end if;

  owner_id := public.leadflow_first_contact_owner_v1(p_lead_id);

  select * into operation_row
    from public.lead_contact_operations
   where lead_id = p_lead_id
     and operation_type = 'FIRST_CONTACT'
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'FIRST_CONTACT_OPERATION_NOT_FOUND';
  end if;

  select * into item_row
    from public.lead_contact_operation_items
   where operation_id = operation_row.id
     and item_key = p_item_key
   for update;
  if not found or item_row.resource_kind <> p_resource_kind then
    raise exception using errcode = '42501', message = 'FIRST_CONTACT_RESOURCE_NOT_FOUND';
  end if;

  if item_row.result = 'ACCEPTED' then
    return jsonb_build_object(
      'status', 'ALREADY_ACCEPTED',
      'item_id', item_row.id,
      'item_key', item_row.item_key,
      'resource_kind', item_row.resource_kind
    );
  end if;

  if item_row.availability = 'AVAILABLE' then
    return jsonb_build_object(
      'status', 'ALREADY_AVAILABLE',
      'item_id', item_row.id,
      'item_key', item_row.item_key,
      'resource_kind', item_row.resource_kind,
      'effect_id', item_row.effect_id
    );
  end if;

  update public.lead_contact_operation_items
     set availability = 'AVAILABLE',
         resource_version = p_resource_version,
         result = null,
         updated_at = now()
   where id = item_row.id;

  insert into public.external_effects (
    user_id,
    lead_id,
    effect_kind,
    business_key,
    item_id
  )
  values (
    owner_id,
    p_lead_id,
    'WHATSAPP_FIRST_CONTACT',
    operation_row.id::text || ':' || p_item_key || ':' || p_resource_version,
    item_row.id
  )
  on conflict (lead_id, effect_kind, business_key) do nothing
  returning * into effect_row;

  if not found then
    select * into effect_row
      from public.external_effects
     where lead_id = p_lead_id
       and effect_kind = 'WHATSAPP_FIRST_CONTACT'
       and business_key = operation_row.id::text || ':' || p_item_key || ':' || p_resource_version;
  end if;

  update public.lead_contact_operation_items
     set effect_id = effect_row.id,
         updated_at = now()
   where id = item_row.id;

  if operation_row.status = 'COMPLETE' then
    update public.lead_contact_operations
       set status = 'RUNNING',
           operation_version = operation_version + 1,
           updated_at = now()
     where id = operation_row.id;
  end if;

  return jsonb_build_object(
    'status', 'HYDRATED',
    'item_id', item_row.id,
    'item_key', item_row.item_key,
    'resource_kind', item_row.resource_kind,
    'effect_id', effect_row.id,
    'effect_version', effect_row.effect_version
  );
end;
$$;

revoke all on function public.hydrate_first_contact_resource_v1(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.hydrate_first_contact_resource_v1(uuid, text, text, text) to service_role;

commit;
