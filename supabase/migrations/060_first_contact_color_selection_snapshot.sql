-- First Contact color selection and immutable resource snapshots.
-- Scheduling remains authoritative in lead_contact_operations/items; this adds
-- only the optional lead selection and the resolved resource projection.

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.car_model_colors'::regclass
      and conname = 'car_model_colors_id_model_key'
  ) then
    alter table public.car_model_colors
      add constraint car_model_colors_id_model_key unique (id, car_model_id);
  end if;
end;
$$;

create table if not exists public.lead_vehicle_color_selections (
  lead_id uuid not null references public.leads(id) on delete cascade,
  vehicle_index smallint not null check (vehicle_index between 0 and 2),
  car_model_id text not null references public.car_models(id) on delete restrict,
  car_model_color_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lead_id, vehicle_index),
  foreign key (car_model_color_id, car_model_id)
    references public.car_model_colors(id, car_model_id)
    on delete restrict
);

create index if not exists lead_vehicle_color_selections_lead_idx
  on public.lead_vehicle_color_selections (lead_id);

alter table public.lead_vehicle_color_selections enable row level security;
drop policy if exists "lead_vehicle_color_selections_select_owner" on public.lead_vehicle_color_selections;
create policy "lead_vehicle_color_selections_select_owner"
on public.lead_vehicle_color_selections for select to authenticated
using (exists (
  select 1 from public.leads
  where leads.id = lead_vehicle_color_selections.lead_id
    and leads.user_id = auth.uid()
    and leads.deleted_at is null
));

revoke all on public.lead_vehicle_color_selections from public, anon, authenticated;
grant select on public.lead_vehicle_color_selections to authenticated;

alter table public.lead_contact_operation_items
  add column if not exists resource_snapshot jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_contact_operation_items'::regclass
      and conname = 'lead_contact_operation_items_resource_snapshot_object_ck'
  ) then
    alter table public.lead_contact_operation_items
      add constraint lead_contact_operation_items_resource_snapshot_object_ck
      check (resource_snapshot is null or jsonb_typeof(resource_snapshot) = 'object');
  end if;
end;
$$;

create or replace function public.request_first_contact_v2(
  p_lead_id uuid,
  p_configuration_digest text,
  p_items jsonb,
  p_color_selections jsonb,
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
  selection_input jsonb;
  item_row public.lead_contact_operation_items;
  effect_row public.external_effects;
  item_rows jsonb := '[]'::jsonb;
  event_result jsonb;
  item_key text;
  resource_kind text;
  resource_version text;
  availability text;
  message_count integer;
  photo_count integer;
  sheet_count integer;
  selection_index integer;
begin
  owner_id := public.leadflow_first_contact_owner_v1(p_lead_id);
  select * into lead_row from public.leads where id = p_lead_id and user_id = owner_id and deleted_at is null;

  if p_configuration_digest is null or p_configuration_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'CONFIGURATION_DIGEST_INVALID';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_COMMAND_INPUT_REQUIRED';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not in (3, 5, 7) then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_ITEMS_REQUIRED';
  end if;
  if p_color_selections is null then p_color_selections := '[]'::jsonb; end if;
  if jsonb_typeof(p_color_selections) <> 'array' or jsonb_array_length(p_color_selections) > 3 then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_COLOR_SELECTIONS_INVALID';
  end if;
  if (select count(distinct value->>'vehicle_index') from jsonb_array_elements(p_color_selections)) <> jsonb_array_length(p_color_selections) then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_COLOR_SELECTIONS_DUPLICATED';
  end if;

  select count(*) filter (where value->>'resource_kind' = 'MESSAGE'),
         count(*) filter (where value->>'resource_kind' = 'PHOTOS'),
         count(*) filter (where value->>'resource_kind' = 'TECHNICAL_SHEET')
    into message_count, photo_count, sheet_count
    from jsonb_array_elements(p_items);

  if message_count <> 1 or photo_count not between 1 and 3 or sheet_count not between 1 and 3 or photo_count <> sheet_count then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_RESOURCES_REQUIRED';
  end if;
  if (select count(distinct value->>'item_key') from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_ITEMS_DUPLICATED';
  end if;

  for selection_input in select value from jsonb_array_elements(p_color_selections) loop
    if selection_input->>'vehicle_index' !~ '^[0-2]$'
       or nullif(btrim(selection_input->>'model_id'), '') is null
       or nullif(btrim(selection_input->>'model_name'), '') is null
       or nullif(btrim(selection_input->>'color_id'), '') is null then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_COLOR_SELECTION_INVALID';
    end if;
    selection_index := (selection_input->>'vehicle_index')::integer;
    if selection_input->>'model_name' <> lead_row.car_models[selection_index + 1] then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_COLOR_SELECTION_MODEL_MISMATCH';
    end if;
    if not exists (
      select 1
      from public.car_model_colors c
      join public.car_models m on m.id = c.car_model_id
      where c.id = selection_input->>'color_id'
        and c.car_model_id = selection_input->>'model_id'
        and c.active = true
        and m.active = true
    ) then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_COLOR_NOT_AVAILABLE_FOR_MODEL';
    end if;
  end loop;

  select * into operation_row
    from public.lead_contact_operations
   where lead_id = p_lead_id and operation_type = 'FIRST_CONTACT'
   for update;
  if found then
    -- Historical operations are authoritative. A changed color selection or
    -- expanded catalog must never add items to an existing operation.
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'resource_kind', i.resource_kind,
      'item_key', i.item_key,
      'resource_version', i.resource_version,
      'availability', i.availability,
      'result', i.result,
      'effect_id', i.effect_id,
      'lead_message_id', i.lead_message_id,
      'provider_message_id', i.provider_message_id,
      'resource_snapshot', i.resource_snapshot
    ) order by i.item_key), '[]'::jsonb)
    into item_rows
    from public.lead_contact_operation_items i
    where i.operation_id = operation_row.id;
    return jsonb_build_object(
      'status', 'REPLAYED',
      'replayed', true,
      'operation', jsonb_build_object('id', operation_row.id, 'lead_id', operation_row.lead_id, 'operation_type', operation_row.operation_type, 'operation_version', operation_row.operation_version, 'status', operation_row.status),
      'items', item_rows
    );
  end if;

  delete from public.lead_vehicle_color_selections where lead_id = p_lead_id;
  for selection_input in select value from jsonb_array_elements(p_color_selections) loop
    insert into public.lead_vehicle_color_selections (lead_id, vehicle_index, car_model_id, car_model_color_id)
    values (p_lead_id, (selection_input->>'vehicle_index')::smallint, selection_input->>'model_id', selection_input->>'color_id');
  end loop;

  insert into public.lead_contact_operations (lead_id, operation_type, configuration_digest)
  values (p_lead_id, 'FIRST_CONTACT', p_configuration_digest)
  returning * into operation_row;

  for item_input in select value from jsonb_array_elements(p_items) loop
    resource_kind := item_input->>'resource_kind';
    item_key := item_input->>'item_key';
    resource_version := item_input->>'resource_version';
    availability := item_input->>'availability';
    if resource_kind not in ('MESSAGE', 'PHOTOS', 'TECHNICAL_SHEET')
       or nullif(btrim(item_key), '') is null
       or nullif(btrim(resource_version), '') is null
       or availability not in ('AVAILABLE', 'NOT_AVAILABLE') then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_ITEM_INVALID';
    end if;
    if resource_kind = 'MESSAGE' and item_input->'resource_snapshot' is not null and item_input->'resource_snapshot' <> 'null'::jsonb then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_MESSAGE_SNAPSHOT_INVALID';
    end if;
    if resource_kind <> 'MESSAGE' and (item_input->'resource_snapshot' is null or jsonb_typeof(item_input->'resource_snapshot') <> 'object') then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_RESOURCE_SNAPSHOT_REQUIRED';
    end if;
    if resource_kind = 'PHOTOS' and item_input->'resource_snapshot'->>'resource' <> 'PHOTO' then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_PHOTO_SNAPSHOT_INVALID';
    end if;
    if resource_kind = 'TECHNICAL_SHEET' and item_input->'resource_snapshot'->>'resource' <> 'TECHNICAL_SHEET' then
      raise exception using errcode = '22023', message = 'FIRST_CONTACT_SHEET_SNAPSHOT_INVALID';
    end if;

    insert into public.lead_contact_operation_items (operation_id, resource_kind, item_key, resource_version, availability, result, resource_snapshot)
    values (operation_row.id, resource_kind, item_key, resource_version, availability, case when availability = 'NOT_AVAILABLE' then 'NOT_AVAILABLE' else null end, nullif(item_input->'resource_snapshot', 'null'::jsonb))
    returning * into item_row;

    if availability = 'AVAILABLE' then
      insert into public.external_effects (user_id, lead_id, effect_kind, business_key, item_id)
      values (owner_id, p_lead_id, 'WHATSAPP_FIRST_CONTACT', operation_row.id::text || ':' || item_key || ':' || resource_version, item_row.id)
      returning * into effect_row;
      update public.lead_contact_operation_items set effect_id = effect_row.id where id = item_row.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'resource_kind', i.resource_kind, 'item_key', i.item_key, 'resource_version', i.resource_version,
    'availability', i.availability, 'result', i.result, 'effect_id', i.effect_id, 'lead_message_id', i.lead_message_id,
    'provider_message_id', i.provider_message_id, 'resource_snapshot', i.resource_snapshot
  ) order by i.item_key), '[]'::jsonb)
  into item_rows from public.lead_contact_operation_items i where i.operation_id = operation_row.id;

  event_result := public.append_leadflow_event_v1(jsonb_build_object(
    'event_type', 'first_contact_requested', 'schema_version', 1, 'occurred_at', now(), 'source', 'PWA', 'stage', 'FIRST_CONTACT',
    'actor_kind', 'ADVISOR', 'actor_id', owner_id, 'correlation_id', gen_random_uuid(), 'idempotency_key', p_idempotency_key,
    'payload', jsonb_build_object('lead_id', p_lead_id, 'requested_resources', (select jsonb_agg(value->>'resource_kind') from jsonb_array_elements(p_items)), 'configuration_digest', p_configuration_digest)
  ), 'identity_components', jsonb_build_array(jsonb_build_object('name', 'operation_id', 'value', operation_row.id)));

  return jsonb_build_object(
    'status', 'CREATED', 'replayed', false, 'event', event_result,
    'operation', jsonb_build_object('id', operation_row.id, 'lead_id', operation_row.lead_id, 'operation_type', operation_row.operation_type, 'operation_version', operation_row.operation_version, 'status', operation_row.status),
    'items', item_rows
  );
end;
$$;

create or replace function public.hydrate_first_contact_resource_v2(
  p_lead_id uuid,
  p_resource_kind text,
  p_item_key text,
  p_resource_version text,
  p_resource_snapshot jsonb
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
  if p_resource_kind not in ('PHOTOS', 'TECHNICAL_SHEET') or nullif(btrim(p_item_key), '') is null or nullif(btrim(p_resource_version), '') is null or p_resource_snapshot is null or jsonb_typeof(p_resource_snapshot) <> 'object' then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_RESOURCE_INPUT_INVALID';
  end if;
  owner_id := public.leadflow_first_contact_owner_v1(p_lead_id);
  select * into operation_row from public.lead_contact_operations where lead_id = p_lead_id and operation_type = 'FIRST_CONTACT' for update;
  if not found then raise exception using errcode = '42501', message = 'FIRST_CONTACT_OPERATION_NOT_FOUND'; end if;
  select * into item_row from public.lead_contact_operation_items where operation_id = operation_row.id and item_key = p_item_key for update;
  if not found or item_row.resource_kind <> p_resource_kind then raise exception using errcode = '42501', message = 'FIRST_CONTACT_RESOURCE_NOT_FOUND'; end if;
  if item_row.result = 'ACCEPTED' then return jsonb_build_object('status', 'ALREADY_ACCEPTED', 'item_id', item_row.id, 'item_key', item_row.item_key, 'resource_kind', item_row.resource_kind); end if;
  if item_row.availability = 'AVAILABLE' then return jsonb_build_object('status', 'ALREADY_AVAILABLE', 'item_id', item_row.id, 'item_key', item_row.item_key, 'resource_kind', item_row.resource_kind, 'effect_id', item_row.effect_id); end if;

  update public.lead_contact_operation_items
     set availability = 'AVAILABLE', resource_version = p_resource_version, result = null, resource_snapshot = p_resource_snapshot, updated_at = now()
   where id = item_row.id;

  insert into public.external_effects (user_id, lead_id, effect_kind, business_key, item_id)
  values (owner_id, p_lead_id, 'WHATSAPP_FIRST_CONTACT', operation_row.id::text || ':' || p_item_key || ':' || p_resource_version, item_row.id)
  on conflict (lead_id, effect_kind, business_key) do nothing
  returning * into effect_row;
  if not found then select * into effect_row from public.external_effects where lead_id = p_lead_id and effect_kind = 'WHATSAPP_FIRST_CONTACT' and business_key = operation_row.id::text || ':' || p_item_key || ':' || p_resource_version; end if;
  update public.lead_contact_operation_items set effect_id = effect_row.id, updated_at = now() where id = item_row.id;
  if operation_row.status = 'COMPLETE' then
    update public.lead_contact_operations set status = 'RUNNING', operation_version = operation_version + 1, updated_at = now() where id = operation_row.id;
  end if;
  return jsonb_build_object('status', 'HYDRATED', 'item_id', item_row.id, 'item_key', item_row.item_key, 'resource_kind', item_row.resource_kind, 'effect_id', effect_row.id, 'effect_version', effect_row.effect_version);
end;
$$;

revoke all on function public.request_first_contact_v2(uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.request_first_contact_v2(uuid, text, jsonb, jsonb, text) to authenticated, service_role;
revoke all on function public.hydrate_first_contact_resource_v2(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hydrate_first_contact_resource_v2(uuid, text, text, text, jsonb) to service_role;

commit;
