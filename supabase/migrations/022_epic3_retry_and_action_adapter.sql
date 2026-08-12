-- E3-S8/S9: explicit, versioned retry for FAILED resources only.

create table if not exists public.lead_contact_operation_commands (
  id uuid primary key default gen_random_uuid(),
  effect_id uuid not null references public.external_effects(id) on delete restrict,
  idempotency_key text not null unique,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.lead_contact_operation_commands enable row level security;

update public.leadflow_event_registry
set emit_status = 'ENABLED', updated_at = now()
where event_type = 'external_effect_retry_scheduled';

create or replace function public.retry_first_contact_effect_v1(
  p_effect_id uuid,
  p_expected_effect_version bigint,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  owner_id uuid;
  effect_row public.external_effects;
  item_row public.lead_contact_operation_items;
  operation_row public.lead_contact_operations;
  attempt_no integer;
  claim_token_digest text;
  result_row jsonb;
  event_result jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'FIRST_CONTACT_RETRY_INPUT_REQUIRED';
  end if;
  select c.result into result_row
  from public.lead_contact_operation_commands c
  join public.external_effects e on e.id = c.effect_id
  join public.lead_contact_operation_items i on i.effect_id = e.id
  join public.lead_contact_operations o on o.id = i.operation_id
  join public.leads l on l.id = o.lead_id
  where c.idempotency_key = p_idempotency_key and l.user_id = owner_id and l.deleted_at is null;
  if found then return result_row || jsonb_build_object('replayed', true); end if;

  select e.* into effect_row
  from public.external_effects e
  join public.lead_contact_operation_items i on i.effect_id = e.id
  join public.lead_contact_operations o on o.id = i.operation_id
  join public.leads l on l.id = o.lead_id
  where e.id = p_effect_id and l.user_id = owner_id and l.deleted_at is null
  for update;
  if not found then raise exception using errcode = '42501', message = 'EFFECT_NOT_FOUND_OR_NOT_OWNED'; end if;
  if p_expected_effect_version is not null and effect_row.effect_version <> p_expected_effect_version then
    result_row := jsonb_build_object('status','STALE_EFFECT','effect_id',effect_row.id,'effect_version',effect_row.effect_version);
  elsif effect_row.state <> 'FAILED' then
    result_row := jsonb_build_object('status','RETRY_NOT_ALLOWED','effect_id',effect_row.id,'effect_version',effect_row.effect_version,'result',effect_row.state);
  else
    select i.* into item_row from public.lead_contact_operation_items i where i.effect_id = effect_row.id;
    select o.* into operation_row from public.lead_contact_operations o where o.id = item_row.operation_id;
    attempt_no := effect_row.current_attempt_no + 1;
    claim_token_digest := encode(digest(p_idempotency_key, 'sha256'), 'hex');
    insert into public.external_effect_attempts(effect_id, attempt_no, claim_token_digest) values (effect_row.id, attempt_no, claim_token_digest);
    update public.external_effects set state = 'CLAIMED', current_attempt_no = attempt_no, effect_version = effect_version + 1, updated_at = now() where id = effect_row.id returning * into effect_row;
    event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_retry_scheduled','schema_version',1,'occurred_at',now(),'source','PWA','stage','FIRST_CONTACT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_idempotency_key,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
    result_row := jsonb_build_object('status','CLAIMED','effect_id',effect_row.id,'attempt_no',attempt_no,'claim_token_digest',claim_token_digest,'effect_version',effect_row.effect_version,'resource_kind',item_row.resource_kind,'item_key',item_row.item_key,'operation_id',operation_row.id);
  end if;
  insert into public.lead_contact_operation_commands(effect_id, idempotency_key, result) values (p_effect_id, p_idempotency_key, result_row);
  return result_row || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.retry_first_contact_effect_v1(uuid,bigint,text) from public, anon;
grant execute on function public.retry_first_contact_effect_v1(uuid,bigint,text) to authenticated;

create or replace function public.get_first_contact_v1(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare owner_id uuid; operation_row public.lead_contact_operations; item_rows jsonb;
begin
  owner_id := public.leadflow_first_contact_owner_v1(p_lead_id);
  select o.* into operation_row from public.lead_contact_operations o where o.lead_id = p_lead_id and o.operation_type = 'FIRST_CONTACT';
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'resource_kind', resource_kind, 'item_key', item_key, 'resource_version', resource_version, 'availability', availability, 'result', result, 'effect_id', effect_id, 'lead_message_id', lead_message_id, 'provider_message_id', provider_message_id) order by item_key), '[]'::jsonb) into item_rows from public.lead_contact_operation_items where operation_id = operation_row.id;
  return jsonb_build_object('status','READ','replayed',false,'operation',jsonb_build_object('id',operation_row.id,'lead_id',operation_row.lead_id,'operation_type',operation_row.operation_type,'operation_version',operation_row.operation_version,'status',operation_row.status),'items',item_rows);
end;
$$;

revoke all on function public.get_first_contact_v1(uuid) from public, anon;
grant execute on function public.get_first_contact_v1(uuid) to authenticated;
