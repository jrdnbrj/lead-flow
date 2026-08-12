-- E4-S5a: canonical event registry and append-only event envelope.

create table if not exists public.leadflow_event_registry (
  event_type text primary key,
  schema_version smallint not null default 1 check (schema_version = 1),
  event_class text not null check (event_class in ('FACT','ATTEMPT','TRANSITION')),
  emit_status text not null default 'REGISTERED_DISABLED' check (emit_status in ('REGISTERED_DISABLED','ENABLED')),
  owner_capability text not null,
  allowed_stage text not null,
  aggregate_type text,
  aggregate_table text,
  payload_contract jsonb not null check (jsonb_typeof(payload_contract) = 'object'),
  identity_recipe jsonb not null check (jsonb_typeof(identity_recipe) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, schema_version),
  check ((event_class = 'TRANSITION') = (aggregate_type is not null and aggregate_table is not null))
);

create or replace function public.leadflow_payload_contract_v1(p_event_type text, p_required text[], p_optional text[])
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  with keys as (select unnest(p_required || p_optional) as key_name), typed as (
    select key_name,
      case
        when key_name in ('models','requested_resources','resource_results') then 'array'
        when key_name in ('deduplicated') then 'boolean'
        when key_name like '%_id' or key_name in ('lead_id','action_id','subscription_id','capability_row_id','effect_id','milestone_id','correction_id','superseded_event_id','message_id','operation_id','delivery_id') then 'uuid'
        when key_name like '%_version' or key_name in ('attempt_no','aggregate_version') then 'positive_int'
        when key_name like '%_at' or key_name in ('scheduled_for','prior_scheduled_for','new_scheduled_for','materialized_at') then 'timestamp'
        when key_name like '%_digest' or key_name in ('configuration_digest','delivery_identity_digest') then 'digest_hex'
        when key_name in ('phone_validation_result','lead_source','association_status','origin','reason','cause','delivery_type','provider') then 'safe_code'
        when key_name in ('review_label','provider_message_id') then 'safe_text'
        else 'safe_text'
      end as type_name
    from keys
  )
  select jsonb_build_object(
    'required', to_jsonb(p_required), 'optional', to_jsonb(p_optional),
    'types', coalesce((select jsonb_object_agg(key_name,type_name) from typed),'{}'::jsonb),
    'fields', coalesce((select jsonb_object_agg(key_name,jsonb_build_object('type',type_name)) from typed),'{}'::jsonb),
    'enums', case
      when p_event_type in ('next_action_created','next_action_done','next_action_ignored') then jsonb_build_object('action_type',jsonb_build_array('CALL','WHATSAPP','QUOTE','OTHER','RESPONSE')) || case when p_event_type='next_action_created' then jsonb_build_object('origin',jsonb_build_array('MANUAL','SUGGESTED')) when p_event_type='next_action_done' then jsonb_build_object('origin',jsonb_build_array('AUTOMATIC','MANUAL_CONFIRMATION')) else '{}'::jsonb end
      when p_event_type in ('response_action_upserted','inbound_message_received') then jsonb_build_object('classification',jsonb_build_array('NO_SUGGESTION','PENDING','REVIEW'))
      when p_event_type='push_action_taken' then jsonb_build_object('command',jsonb_build_array('DONE','IGNORE','POSTPONE_PLUS_ONE_HOUR','POSTPONE_LATER','POSTPONE_TOMORROW','POSTPONE_IN_THREE_DAYS'))
      else '{}'::jsonb
    end,
    'rules', jsonb_build_object(
      'models', case when p_event_type='lead_created' then jsonb_build_object('min_items',1,'max_items',10,'item_type','safe_text') else null end,
      'occurred_at','utc_timestamptz',
      'additional_keys','reject',
      'secret_patterns','reject',
      'requested_resources',jsonb_build_array('MESSAGE','PHOTOS','TECHNICAL_SHEET'),
      'arrays', jsonb_build_object(
        'models', jsonb_build_object('type','array','items',jsonb_build_object('type','safe_text'),'min_items',1,'max_items',10),
        'requested_resources', jsonb_build_object('type','array','items',jsonb_build_object('type','enum','values',jsonb_build_array('MESSAGE','PHOTOS','TECHNICAL_SHEET')),'unique',true),
        'resource_results', jsonb_build_object('type','array','items',jsonb_build_object('type','object','required',jsonb_build_array('resource','result'),'optional',jsonb_build_array('provider_message_id'),'additional','reject','properties',jsonb_build_object(
          'resource',jsonb_build_object('type','enum','values',jsonb_build_array('MESSAGE','PHOTOS','TECHNICAL_SHEET')),
          'result',jsonb_build_object('type','enum','values',jsonb_build_array('ACCEPTED','FAILED','UNKNOWN','NOT_AVAILABLE')),
          'provider_message_id',jsonb_build_object('type','safe_text')
        ),'conditionals',jsonb_build_array(
          jsonb_build_object('when',jsonb_build_object('field','result','equals','ACCEPTED'),'required',jsonb_build_array('provider_message_id')),
          jsonb_build_object('when',jsonb_build_object('field','result','in',jsonb_build_array('FAILED','UNKNOWN','NOT_AVAILABLE')),'forbidden',jsonb_build_array('provider_message_id'))
        ))
      )),
      'conditionals', case
        when p_event_type='response_action_upserted' then jsonb_build_array(
          jsonb_build_object('when',jsonb_build_object('field','classification','equals','REVIEW'),'required',jsonb_build_array('review_label'),'equals',jsonb_build_object('review_label','Revisar')),
          jsonb_build_object('when',jsonb_build_object('field','classification','not_equals','REVIEW'),'forbidden',jsonb_build_array('review_label')))
        when p_event_type='first_contact_result' then jsonb_build_array(jsonb_build_object('when',jsonb_build_object('field','result','not_equals',null),'forbidden',jsonb_build_array('result')))
        else '[]'::jsonb end
    ),
    'normalization', jsonb_build_object('uuid','lowercase_rfc4122','text','nfc_utf8_no_controls','timestamp','utc_timestamptz','positive_int','decimal_ascii','digest','lowercase_sha256_hex')
  )
$$;

create or replace function public.leadflow_identity_recipe_v1(p_event_type text, p_names text[])
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'component', name, 'type', case when name like '%version' or name='attempt_no' then 'positive_int' when name like '%id' or name in ('lead_id','action_id','subscription_id','capability_row_id','effect_id','milestone_id','correction_id','superseded_event_id','message_id','operation_id','delivery_id') then 'uuid' when name like '%digest' then 'digest_hex' when name='fingerprint_kind' then 'fingerprint_kind' when name='fingerprint_value' then 'fingerprint_value' else 'safe_text' end,
    'nullable', false,
    'constant', case when name='stage' and p_event_type='lead_capture_failed' then 'CAPTURE' when name='marker' then 'BEGIN_IO' when name='aggregate_type' and p_event_type like 'next_action_%' then 'FOLLOW_UP_ACTION' when name='aggregate_type' and p_event_type in ('push_generated','push_service_result') then 'PUSH_DELIVERY' when name='aggregate_type' and p_event_type like 'push_subscription_%' then 'PUSH_SUBSCRIPTION' when name='aggregate_type' and p_event_type like 'external_effect_%' then 'EXTERNAL_EFFECT' else null end,
    'normalization', case when name like '%id' or name in ('lead_id','action_id','subscription_id','capability_row_id','effect_id','milestone_id','correction_id','superseded_event_id','message_id','operation_id','delivery_id') then 'UUID_LOWERCASE' when name like '%digest' then 'DIGEST_HEX' when name in ('stage','marker','fingerprint_kind') then 'ASCII_TOKEN' when name='evolution_instance_canonical' or name='provider_message_id_canonical' then 'TRIM_ASCII_THEN_NFC' when name='fingerprint_value' then 'BY_FINGERPRINT_KIND' else 'NFC_UTF8' end,
    'values', case when name='fingerprint_kind' then jsonb_build_array('PROVIDER_MESSAGE_ID','RAW_BODY_SHA256') else null end,
    'canonicalization', case when name in ('evolution_instance_canonical','provider_message_id_canonical') then 'trim_ascii_spaces_then_nfc' when name='fingerprint_value' then 'fingerprint_kind_dependent' else null end,
    'order', ordinality
  ) order by ordinality),'[]'::jsonb)
  from unnest(p_names) with ordinality as items(name,ordinality)
$$;

create table if not exists public.leadflow_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (event_key ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null,
  schema_version smallint not null default 1 check (schema_version = 1),
  occurred_at timestamptz not null,
  source text not null check (source in ('PWA','WEBHOOK','PUSH','SCHEDULER','SYSTEM','LEADFLOW_WHATSAPP_ACCEPTED','NATIVE_WHATSAPP_CONFIRMED')),
  stage text not null,
  actor_kind text not null check (actor_kind in ('ADVISOR','WEBHOOK','SCHEDULER','SYSTEM')),
  actor_id uuid,
  correlation_id uuid,
  idempotency_key text,
  result text,
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  aggregate_type text,
  aggregate_id uuid,
  aggregate_version bigint check (aggregate_version is null or aggregate_version > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  foreign key (event_type, schema_version) references public.leadflow_event_registry(event_type, schema_version),
  check ((actor_kind = 'ADVISOR') = (actor_id is not null)),
  check (actor_kind <> 'ADVISOR' or actor_id = user_id),
  check ((aggregate_type is null and aggregate_id is null and aggregate_version is null) or (aggregate_type is not null and aggregate_id is not null and aggregate_version is not null)),
  check (payload::text !~* '(password|secret|token|cookie|authorization|service.role|private.key|raw_payload|request_body)')
);

create index if not exists leadflow_events_user_occurred_idx on public.leadflow_events(user_id, occurred_at desc);
create index if not exists leadflow_events_type_occurred_idx on public.leadflow_events(event_type, occurred_at desc);

with seed(event_type,event_class,owner_capability,allowed_stage,aggregate_type,aggregate_table,required_keys,optional_keys,identity_recipe) as (
  values
  ('lead_created','FACT','Epic 1 / captura','CAPTURE',null,null,array['lead_id','models','phone_validation_result'],array['lead_source'],array['lead_id']),
  ('lead_capture_failed','ATTEMPT','Epic 1 / captura','CAPTURE',null,null,array[]::text[],array[]::text[],array['idempotency_key','stage']),
  ('next_action_created','FACT','Epic 1 / acciones','ACTIONS',null,null,array['lead_id','action_type','scheduled_for','origin'],array[]::text[],array['action_id']),
  ('next_action_done','TRANSITION','Epic 1 / acciones','ACTIONS','FOLLOW_UP_ACTION','lead_follow_up_actions',array['lead_id','action_id','action_type','origin'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('next_action_postponed','TRANSITION','Epic 1 / acciones','ACTIONS','FOLLOW_UP_ACTION','lead_follow_up_actions',array['lead_id','action_id','prior_scheduled_for','new_scheduled_for'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('next_action_ignored','TRANSITION','Epic 1 / acciones','ACTIONS','FOLLOW_UP_ACTION','lead_follow_up_actions',array['lead_id','action_id','action_type'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('next_action_canceled','TRANSITION','Epic 1 / acciones','ACTIONS','FOLLOW_UP_ACTION','lead_follow_up_actions',array['lead_id','action_id','reason'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('inbound_message_received','FACT','Epic 2 / inbound','INBOUND',null,null,array['lead_id','provider_message_id','association_status','classification'],array[]::text[],array['message_id']),
  ('inbound_message_rejected','FACT','Epic 2 / inbound','INBOUND',null,null,array[]::text[],array[]::text[],array['evolution_instance_canonical','fingerprint_kind','fingerprint_value']),
  ('inbound_lead_match_ambiguous','FACT','Epic 2 / inbound','INBOUND',null,null,array[]::text[],array[]::text[],array['evolution_instance_canonical','fingerprint_kind','fingerprint_value']),
  ('response_action_upserted','TRANSITION','Epic 2 / inbound','INBOUND','FOLLOW_UP_ACTION','lead_follow_up_actions',array['lead_id','action_id','scheduled_for','classification','deduplicated'],array['review_label'],array['aggregate_type','aggregate_id','aggregate_version']),
  ('first_contact_requested','FACT','Epic 3 / first contact','FIRST_CONTACT',null,null,array['lead_id','requested_resources','configuration_digest'],array[]::text[],array['operation_id']),
  ('first_contact_result','TRANSITION','Epic 3 / first contact','FIRST_CONTACT','LEAD_CONTACT_OPERATION','lead_contact_operations',array['lead_id','resource_results'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_delivery_scheduled','FACT','Epic 5 / Push','PUSH',null,null,array['lead_id','action_id','action_version','subscription_id','subscription_generation','scheduled_for','materialized_at'],array[]::text[],array['delivery_id']),
  ('push_generated','TRANSITION','Epic 5 / Push','PUSH','PUSH_DELIVERY','push_deliveries',array['lead_id','action_id','action_version','subscription_id','subscription_generation','scheduled_for','delivery_type'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_service_result','TRANSITION','Epic 5 / Push','PUSH','PUSH_DELIVERY','push_deliveries',array['action_id','action_version','subscription_id','subscription_generation','provider'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_subscription_activated','TRANSITION','Epic 5 / Push','PUSH','PUSH_SUBSCRIPTION','push_subscriptions',array[]::text[],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_subscription_deactivated','TRANSITION','Epic 5 / Push','PUSH','PUSH_SUBSCRIPTION','push_subscriptions',array[]::text[],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_subscription_invalid','TRANSITION','Epic 5 / Push','PUSH','PUSH_SUBSCRIPTION','push_subscriptions',array['cause'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_action_taken','TRANSITION','Epic 5 / Push','PUSH','FOLLOW_UP_ACTION','lead_follow_up_actions',array['action_id','command'],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('push_action_rejected','FACT','Epic 5 / Push','PUSH',null,null,array['capability_row_id'],array[]::text[],array['capability_row_id','result']),
  ('push_duplicate_suppressed','FACT','Epic 5 / Push','PUSH',null,null,array['action_id','action_version','subscription_id','subscription_generation','reason'],array[]::text[],array['delivery_identity_digest']),
  ('external_effect_claimed','TRANSITION','AD-7 Effects ledger','EXTERNAL_EFFECT','EXTERNAL_EFFECT','external_effects',array[]::text[],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('external_effect_io_started','ATTEMPT','AD-7 Effects ledger','EXTERNAL_EFFECT',null,null,array['effect_id','attempt_no'],array[]::text[],array['effect_id','attempt_no','marker']),
  ('external_effect_result_recorded','TRANSITION','AD-7 Effects ledger','EXTERNAL_EFFECT','EXTERNAL_EFFECT','external_effects',array[]::text[],array['provider'],array['aggregate_type','aggregate_id','aggregate_version']),
  ('external_effect_retry_scheduled','TRANSITION','AD-7 Effects ledger','EXTERNAL_EFFECT','EXTERNAL_EFFECT','external_effects',array[]::text[],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('external_effect_canceled','TRANSITION','AD-7 Effects ledger','EXTERNAL_EFFECT','EXTERNAL_EFFECT','external_effects',array[]::text[],array[]::text[],array['aggregate_type','aggregate_id','aggregate_version']),
  ('external_effect_reconciled','TRANSITION','AD-7 Effects ledger','EXTERNAL_EFFECT','EXTERNAL_EFFECT','external_effects',array[]::text[],array['provider'],array['aggregate_type','aggregate_id','aggregate_version']),
  ('purchase_decision_recorded','FACT','Epic 6 / purchase decision','PURCHASE',null,null,array['lead_id','milestone_id','origin'],array[]::text[],array['milestone_id']),
  ('audit_correction','FACT','Epic 4 / audit','AUDIT',null,null,array['correction_id','superseded_event_id'],array[]::text[],array['correction_id','superseded_event_id'])
)
insert into public.leadflow_event_registry(event_type,event_class,owner_capability,allowed_stage,aggregate_type,aggregate_table,payload_contract,identity_recipe)
select event_type,event_class,owner_capability,allowed_stage,aggregate_type,aggregate_table,
       public.leadflow_payload_contract_v1(event_type,required_keys,optional_keys),public.leadflow_identity_recipe_v1(event_type,identity_recipe)
from seed
on conflict (event_type) do update set
  event_class=excluded.event_class, owner_capability=excluded.owner_capability,
  allowed_stage=excluded.allowed_stage, aggregate_type=excluded.aggregate_type,
  aggregate_table=excluded.aggregate_table, payload_contract=excluded.payload_contract,
  identity_recipe=excluded.identity_recipe, updated_at=now();

create or replace function public.leadflow_event_registry_mutation_guard_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if current_user not in ('postgres','supabase_admin') then
    raise exception using errcode='42501', message='LEADFLOW_EVENT_REGISTRY_CONTROLLER_ONLY';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists leadflow_event_registry_mutation_guard on public.leadflow_event_registry;
create trigger leadflow_event_registry_mutation_guard
before insert or update or delete on public.leadflow_event_registry
for each row execute function public.leadflow_event_registry_mutation_guard_v1();

create or replace function public.leadflow_events_insert_guard_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_catalog as $$
declare r record; allowed jsonb; key_name text; owner_id uuid;
begin
  if current_setting('leadflow.append_context', true) <> '1' then raise exception using errcode='42501',message='DIRECT_EVENT_INSERT_FORBIDDEN'; end if;
  select * into r from public.leadflow_event_registry where event_type=new.event_type and schema_version=new.schema_version;
  if not found or r.emit_status <> 'ENABLED' then raise exception using errcode='42501',message='EVENT_TYPE_DISABLED'; end if;
  if new.stage is distinct from r.allowed_stage then raise exception using errcode='22023',message='EVENT_STAGE_INVALID'; end if;
  select advisor_user_id into owner_id from public.leadflow_installation where singleton=true;
  if new.user_id is distinct from owner_id then raise exception using errcode='42501',message='EVENT_OWNER_MISMATCH'; end if;
  allowed := (r.payload_contract->'required') || (r.payload_contract->'optional');
  for key_name in select jsonb_array_elements_text(r.payload_contract->'required') loop
    if not (new.payload ? key_name) then raise exception using errcode='22023',message='EVENT_PAYLOAD_REQUIRED_FIELD'; end if;
  end loop;
  for key_name in select key from jsonb_each(new.payload) where not (allowed ? key) loop
    raise exception using errcode='22023',message='EVENT_PAYLOAD_ADDITIONAL_FIELD';
  end loop;
  if r.event_class='TRANSITION' and (new.aggregate_type is distinct from r.aggregate_type or new.aggregate_id is null or new.aggregate_version is null) then raise exception using errcode='22023',message='EVENT_AGGREGATE_INVALID'; end if;
  if r.event_class <> 'TRANSITION' and (new.aggregate_type is not null or new.aggregate_id is not null or new.aggregate_version is not null) then raise exception using errcode='22023',message='EVENT_AGGREGATE_FORBIDDEN'; end if;
  if new.payload::text ~* '(password|secret|token|cookie|authorization|service.role|private.key|raw_payload|request_body)' then raise exception using errcode='22023',message='EVENT_SENSITIVE_PAYLOAD'; end if;
  return new;
end $$;

drop trigger if exists leadflow_events_registry_insert_guard on public.leadflow_events;
create trigger leadflow_events_registry_insert_guard
before insert on public.leadflow_events
for each row execute function public.leadflow_events_insert_guard_v1();

create or replace function public.leadflow_event_key_v1(p_event_type text, p_schema_version smallint, p_identity_components jsonb)
returns text language plpgsql stable set search_path = public, extensions as $$
declare r record; c record; material text := format('leadflow-event-key/v1|event_type=%s|schema_version=%s|',p_event_type,p_schema_version); value_text text; raw_value text; fingerprint_kind_text text;
begin
  select * into r from public.leadflow_event_registry where event_type=p_event_type and schema_version=p_schema_version;
  if not found or jsonb_typeof(p_identity_components) <> 'array' or jsonb_array_length(p_identity_components) <> jsonb_array_length(r.identity_recipe) then raise exception using errcode='22023',message='IDENTITY_RECIPE_MISMATCH'; end if;
  for c in select value,ordinality from jsonb_array_elements(p_identity_components) with ordinality order by ordinality loop
    if not (c.value ? 'value') then raise exception using errcode='22023',message='IDENTITY_COMPONENT_MISSING'; end if;
    if c.value->>'name' <> (r.identity_recipe->(c.ordinality::int-1))->>'component' then raise exception using errcode='22023',message='IDENTITY_RECIPE_MISMATCH'; end if;
    if c.value->'value' = 'null'::jsonb and coalesce((r.identity_recipe->(c.ordinality::int-1))->>'nullable','false') <> 'true' then raise exception using errcode='22023',message='IDENTITY_NULL_FORBIDDEN'; end if;
    raw_value := case when c.value->'value' = 'null'::jsonb then 'NULL' else c.value->>'value' end;
    value_text := raw_value;
    if value_text <> 'NULL' and (r.identity_recipe->(c.ordinality::int-1))->>'normalization'='UUID_LOWERCASE' then value_text := lower(value_text); end if;
    if value_text <> 'NULL' and (r.identity_recipe->(c.ordinality::int-1))->>'type'='positive_int' then value_text := ltrim(value_text,'0'); if value_text='' then value_text := '0'; end if; end if;
    if value_text <> 'NULL' and (r.identity_recipe->(c.ordinality::int-1))->>'type'='digest_hex' then value_text := lower(value_text); end if;
    if value_text <> 'NULL' and (r.identity_recipe->(c.ordinality::int-1))->>'type'='fingerprint_kind' then value_text := upper(value_text); end if;
    if value_text <> 'NULL' and (r.identity_recipe->(c.ordinality::int-1))->>'normalization'='TRIM_ASCII_THEN_NFC' then value_text := normalize(btrim(value_text,' '),NFC); end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'component'='fingerprint_kind' then fingerprint_kind_text := value_text; end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'component'='fingerprint_value' and fingerprint_kind_text='RAW_BODY_SHA256' then value_text := lower(value_text); end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'component'='fingerprint_value' and fingerprint_kind_text='PROVIDER_MESSAGE_ID' then value_text := normalize(btrim(value_text,' '),NFC); end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'constant' is not null and value_text <> (r.identity_recipe->(c.ordinality::int-1))->>'constant' then raise exception using errcode='22023',message='IDENTITY_CONSTANT_MISMATCH'; end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'type'='uuid' and value_text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='IDENTITY_UUID_INVALID'; end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'type'='positive_int' and value_text !~ '^[1-9][0-9]*$' then raise exception using errcode='22023',message='IDENTITY_POSITIVE_INT_INVALID'; end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'type'='digest_hex' and value_text !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='IDENTITY_DIGEST_INVALID'; end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'type'='fingerprint_kind' and value_text not in ('PROVIDER_MESSAGE_ID','RAW_BODY_SHA256') then raise exception using errcode='IDENTITY_FINGERPRINT_KIND_INVALID'; end if;
    if (r.identity_recipe->(c.ordinality::int-1))->>'type'='fingerprint_value' and fingerprint_kind_text='RAW_BODY_SHA256' and value_text !~ '^[0-9a-f]{64}$' then raise exception using errcode='IDENTITY_FINGERPRINT_INVALID'; end if;
    if value_text = '' and (r.identity_recipe->(c.ordinality::int-1))->>'type' in ('fingerprint_kind','fingerprint_value') then raise exception using errcode='22023',message='IDENTITY_FINGERPRINT_EMPTY'; end if;
    if value_text <> 'NULL' and (value_text ~ '[[:cntrl:]]' or value_text <> normalize(value_text, NFC)) then raise exception using errcode='22023',message='IDENTITY_TEXT_INVALID'; end if;
    material := material || format('%s=%s:%s;',c.value->>'name',octet_length(value_text),value_text);
  end loop;
  return encode(digest(convert_to(material,'utf8'),'sha256'),'hex');
end $$;

create or replace function public.leadflow_validate_payload_value_v1(p_value jsonb, p_spec jsonb, p_path text)
returns void language plpgsql immutable set search_path = public, pg_catalog as $$
declare item jsonb; key_name text; value_text text; item_count integer;
begin
  if p_spec ? 'values' and not ((p_spec->'values') ? (p_value #>> '{}')) then raise exception using errcode='22023',message='EVENT_ENUM_INVALID'; end if;
  case p_spec->>'type'
    when 'uuid' then if jsonb_typeof(p_value)<>'string' or p_value #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='EVENT_UUID_INVALID'; end if;
    when 'positive_int' then if p_value #>> '{}' !~ '^[1-9][0-9]*$' then raise exception using errcode='22023',message='EVENT_POSITIVE_INT_INVALID'; end if;
    when 'digest_hex' then if jsonb_typeof(p_value)<>'string' or p_value #>> '{}' !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='EVENT_DIGEST_INVALID'; end if;
    when 'boolean' then if jsonb_typeof(p_value)<>'boolean' then raise exception using errcode='22023',message='EVENT_BOOLEAN_INVALID'; end if;
    when 'timestamp' then if jsonb_typeof(p_value)<>'string' or p_value #>> '{}' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception using errcode='22023',message='EVENT_TIMESTAMP_INVALID'; end if; begin perform (p_value #>> '{}')::timestamptz; exception when others then raise exception using errcode='22023',message='EVENT_TIMESTAMP_INVALID'; end;
    when 'safe_code' then if jsonb_typeof(p_value)<>'string' or p_value #>> '{}' !~ '^[A-Z][A-Z0-9_]{1,63}$' then raise exception using errcode='22023',message='EVENT_SAFE_CODE_INVALID'; end if;
    when 'safe_text' then if jsonb_typeof(p_value)<>'string' or p_value #>> '{}' ~ '[[:cntrl:]]' or length(p_value #>> '{}')>256 or p_value #>> '{}' <> normalize(p_value #>> '{}', NFC) then raise exception using errcode='22023',message='EVENT_SAFE_TEXT_INVALID'; end if;
    when 'array' then
      if jsonb_typeof(p_value)<>'array' then raise exception using errcode='22023',message='EVENT_ARRAY_INVALID'; end if;
      item_count := jsonb_array_length(p_value);
      if p_spec ? 'min_items' and item_count < (p_spec->>'min_items')::integer then raise exception using errcode='22023',message='EVENT_ARRAY_MIN_ITEMS'; end if;
      if p_spec ? 'max_items' and item_count > (p_spec->>'max_items')::integer then raise exception using errcode='22023',message='EVENT_ARRAY_MAX_ITEMS'; end if;
      if p_spec ? 'unique' and (select count(*) <> count(distinct value::text) from jsonb_array_elements(p_value)) then raise exception using errcode='22023',message='EVENT_ARRAY_DUPLICATE'; end if;
      for item in select value from jsonb_array_elements(p_value) loop perform public.leadflow_validate_payload_value_v1(item,p_spec->'items',p_path); end loop;
    when 'object' then
      if jsonb_typeof(p_value)<>'object' then raise exception using errcode='22023',message='EVENT_OBJECT_INVALID'; end if;
      for key_name in select jsonb_array_elements_text(coalesce(p_spec->'required','[]'::jsonb)) loop if not (p_value ? key_name) then raise exception using errcode='22023',message='EVENT_NESTED_REQUIRED_FIELD'; end if; end loop;
      for key_name in select key from jsonb_each(p_value) loop if not (p_spec->'properties' ? key_name) and p_spec->>'additional'='reject' then raise exception using errcode='22023',message='EVENT_NESTED_ADDITIONAL_FIELD'; end if; end loop;
      for key_name in select key from jsonb_each(p_value) loop if p_spec->'properties' ? key_name then perform public.leadflow_validate_payload_value_v1(p_value->key_name,p_spec->'properties'->key_name,p_path||'.'||key_name); end if; end loop;
      for item in select value from jsonb_array_elements(coalesce(p_spec->'conditionals','[]'::jsonb)) loop
        key_name := item->'when'->>'field';
        if (item->'when' ? 'equals' and p_value->>key_name = item->'when'->>'equals') or (item->'when' ? 'in' and (item->'when'->'in' ? (p_value->>key_name))) then
          if item->'required' ? 'provider_message_id' and not (p_value ? 'provider_message_id') then raise exception using errcode='22023',message='EVENT_NESTED_CONDITIONAL_REQUIRED'; end if;
          if item->'forbidden' ? 'provider_message_id' and p_value ? 'provider_message_id' then raise exception using errcode='22023',message='EVENT_NESTED_CONDITIONAL_FORBIDDEN'; end if;
        end if;
      end loop;
    else null;
  end case;
end $$;

create or replace function public.leadflow_validate_payload_contract_v1(p_payload jsonb, p_contract jsonb)
returns void language plpgsql immutable set search_path = public, pg_catalog as $$
declare key_name text; allowed jsonb; spec jsonb; condition jsonb; field_name text;
begin
  if jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='EVENT_PAYLOAD_OBJECT_REQUIRED'; end if;
  allowed := (p_contract->'required') || (p_contract->'optional');
  for key_name in select jsonb_array_elements_text(p_contract->'required') loop if not (p_payload ? key_name) then raise exception using errcode='22023',message='EVENT_PAYLOAD_REQUIRED_FIELD'; end if; end loop;
  for key_name in select key from jsonb_each(p_payload) loop if not (allowed ? key_name) then raise exception using errcode='22023',message='EVENT_PAYLOAD_ADDITIONAL_FIELD'; end if; end loop;
  for key_name in select key from jsonb_each(p_payload) loop
    spec := coalesce(p_contract->'fields'->key_name,'{}'::jsonb) || coalesce(p_contract->'rules'->'arrays'->key_name,'{}'::jsonb);
    if spec ? 'type' then perform public.leadflow_validate_payload_value_v1(p_payload->key_name,spec,key_name); end if;
  end loop;
  for condition in select value from jsonb_array_elements(coalesce(p_contract->'rules'->'conditionals','[]'::jsonb)) loop
    field_name := condition->'when'->>'field';
    if (condition->'when' ? 'equals' and p_payload->>field_name = condition->'when'->>'equals') or (condition->'when' ? 'not_equals' and p_payload->>field_name is distinct from condition->'when'->>'not_equals') or (condition->'when' ? 'in' and (condition->'when'->'in' ? (p_payload->>field_name))) then
      for key_name in select jsonb_array_elements_text(coalesce(condition->'required','[]'::jsonb)) loop if not (p_payload ? key_name) then raise exception using errcode='22023',message='EVENT_CONDITIONAL_REQUIRED_FIELD'; end if; end loop;
      for key_name in select jsonb_array_elements_text(coalesce(condition->'forbidden','[]'::jsonb)) loop if p_payload ? key_name then raise exception using errcode='22023',message='EVENT_CONDITIONAL_FORBIDDEN_FIELD'; end if; end loop;
      for key_name in select key from jsonb_each(coalesce(condition->'equals','{}'::jsonb)) loop if p_payload->>key_name <> condition->'equals'->>key_name then raise exception using errcode='22023',message='EVENT_CONDITIONAL_VALUE_INVALID'; end if; end loop;
    end if;
  end loop;
end $$;

create or replace function public.leadflow_validate_event_contract_v1(p_event jsonb, p_registry public.leadflow_event_registry)
returns void language plpgsql immutable set search_path = public, pg_catalog as $$
declare item jsonb;
begin
  perform public.leadflow_validate_payload_contract_v1(p_event->'payload',p_registry.payload_contract);
  if p_event->'identity_components' is null or jsonb_typeof(p_event->'identity_components') <> 'array' then raise exception using errcode='22023',message='IDENTITY_COMPONENTS_INVALID'; end if;
  for item in select value from jsonb_array_elements(p_event->'identity_components') loop
    if jsonb_typeof(item) <> 'object' or not (item ? 'name') or not (item ? 'value') or jsonb_typeof(item->'value') not in ('string','number','boolean','null') then raise exception using errcode='22023',message='IDENTITY_COMPONENT_INVALID'; end if;
  end loop;
end $$;

create or replace function public.append_leadflow_event_v1(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.leadflow_event_registry; owner_id uuid; e public.leadflow_events; computed_key text; payload jsonb; allowed jsonb; key_name text; effective_occurred_at timestamptz;
begin
  if jsonb_typeof(p_event) <> 'object' or not (p_event ? 'occurred_at') then raise exception using errcode='22023',message='EVENT_OCCURRED_AT_REQUIRED'; end if;
  select * into r from public.leadflow_event_registry where event_type=p_event->>'event_type' and schema_version=coalesce((p_event->>'schema_version')::smallint,1);
  if not found then raise exception using errcode='22023',message='EVENT_TYPE_UNKNOWN'; end if;
  if r.emit_status <> 'ENABLED' then raise exception using errcode='42501',message='EVENT_TYPE_DISABLED'; end if;
  if p_event->>'stage' is distinct from r.allowed_stage then raise exception using errcode='22023',message='EVENT_STAGE_INVALID'; end if;
  if (p_event->>'source',p_event->>'actor_kind') not in (('PWA','ADVISOR'),('WEBHOOK','WEBHOOK'),('PUSH','ADVISOR'),('SCHEDULER','SCHEDULER'),('SYSTEM','SYSTEM'),('LEADFLOW_WHATSAPP_ACCEPTED','WEBHOOK'),('NATIVE_WHATSAPP_CONFIRMED','ADVISOR')) then raise exception using errcode='22023',message='EVENT_SOURCE_ACTOR_INVALID'; end if;
  select advisor_user_id into owner_id from public.leadflow_installation where singleton=true;
  if owner_id is null then raise exception using errcode='23514',message='INSTALLATION_OWNER_MISSING'; end if;
  if p_event->>'actor_kind'='ADVISOR' and nullif(p_event->>'actor_id','')::uuid is distinct from owner_id then raise exception using errcode='42501',message='EVENT_OWNER_MISMATCH'; end if;
  payload := coalesce(p_event->'payload','{}'::jsonb); allowed := (r.payload_contract->'required') || (r.payload_contract->'optional');
  for key_name in select jsonb_array_elements_text(r.payload_contract->'required') loop if not payload ? key_name then raise exception using errcode='22023',message='EVENT_PAYLOAD_REQUIRED_FIELD'; end if; end loop;
  for key_name in select key from jsonb_each(payload) where not (allowed ? key) loop raise exception using errcode='22023',message='EVENT_PAYLOAD_ADDITIONAL_FIELD'; end loop;
  if payload::text ~* '(password|secret|token|cookie|authorization|service.role|private.key|raw_payload|request_body)' then raise exception using errcode='22023',message='EVENT_SENSITIVE_PAYLOAD'; end if;
  perform public.leadflow_validate_event_contract_v1(p_event, r);
  if r.event_class='TRANSITION' and (p_event->>'aggregate_type' is distinct from r.aggregate_type or nullif(p_event->>'aggregate_id','') is null or coalesce((p_event->>'aggregate_version')::bigint,0)<=0) then raise exception using errcode='22023',message='EVENT_AGGREGATE_INVALID'; end if;
  if r.event_class <> 'TRANSITION' and (p_event ? 'aggregate_type' or p_event ? 'aggregate_id' or p_event ? 'aggregate_version') then raise exception using errcode='22023',message='EVENT_AGGREGATE_FORBIDDEN'; end if;
  computed_key := public.leadflow_event_key_v1(r.event_type,r.schema_version,p_event->'identity_components');
  effective_occurred_at := (p_event->>'occurred_at')::timestamptz;
  perform set_config('leadflow.append_context','1',true);
  begin
    insert into public.leadflow_events(event_key,user_id,event_type,schema_version,occurred_at,source,stage,actor_kind,actor_id,correlation_id,idempotency_key,result,error_code,aggregate_type,aggregate_id,aggregate_version,payload)
    values(computed_key,owner_id,r.event_type,r.schema_version,effective_occurred_at,p_event->>'source',r.allowed_stage,p_event->>'actor_kind',nullif(p_event->>'actor_id','')::uuid,nullif(p_event->>'correlation_id','')::uuid,p_event->>'idempotency_key',p_event->>'result',p_event->>'error_code',nullif(p_event->>'aggregate_type',''),nullif(p_event->>'aggregate_id','')::uuid,nullif(p_event->>'aggregate_version','')::bigint,payload) returning * into e;
    perform set_config('leadflow.append_context','0',true);
    return jsonb_build_object('status','APPENDED','id',e.id,'event_key',e.event_key,'correlation_id',e.correlation_id);
  exception when unique_violation then
    select * into e from public.leadflow_events where event_key=computed_key;
    if e.user_id=owner_id and e.event_type=r.event_type and e.schema_version=r.schema_version and e.payload=payload and e.source=p_event->>'source' and e.stage=r.allowed_stage and e.actor_kind=p_event->>'actor_kind' and e.actor_id is not distinct from nullif(p_event->>'actor_id','')::uuid and e.idempotency_key is not distinct from p_event->>'idempotency_key' and e.result is not distinct from p_event->>'result' and e.error_code is not distinct from p_event->>'error_code' and e.aggregate_type is not distinct from nullif(p_event->>'aggregate_type','') and e.aggregate_id is not distinct from nullif(p_event->>'aggregate_id','')::uuid and e.aggregate_version is not distinct from nullif(p_event->>'aggregate_version','')::bigint and e.occurred_at=effective_occurred_at then perform set_config('leadflow.append_context','0',true); return jsonb_build_object('status','REPLAYED','id',e.id,'event_key',e.event_key); end if;
    perform set_config('leadflow.append_context','0',true);
    return jsonb_build_object('status','EVENT_KEY_CONFLICT','id',e.id,'event_key',e.event_key);
  end;
end $$;

revoke all on table public.leadflow_events from public, anon, authenticated, service_role;
revoke all on table public.leadflow_event_registry from public, anon, authenticated, service_role;
revoke all on function public.append_leadflow_event_v1(jsonb) from public, anon, authenticated;
grant execute on function public.append_leadflow_event_v1(jsonb) to service_role;
