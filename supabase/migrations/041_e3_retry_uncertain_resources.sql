-- E3: allow an advisor to retry a provider-uncertain resource.
-- UNKNOWN is not delivery confirmation, but it must remain recoverable through
-- the existing fenced/idempotent retry path.

begin;

create or replace function public.claim_first_contact_effect_v1(p_effect_id uuid, p_claim_token_digest text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare owner_id uuid; effect_row public.external_effects; attempt_no integer; event_result jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_claim_token_digest is null or p_claim_token_digest !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023', message='CLAIM_TOKEN_DIGEST_INVALID'; end if;
  select e.* into effect_row from public.external_effects e join public.lead_contact_operation_items i on i.effect_id=e.id join public.lead_contact_operations o on o.id=i.operation_id join public.leads l on l.id=o.lead_id where e.id=p_effect_id and l.user_id=owner_id and l.deleted_at is null for update;
  if not found then raise exception using errcode='42501', message='EFFECT_NOT_FOUND_OR_NOT_OWNED'; end if;
  if effect_row.state not in ('READY','FAILED','UNKNOWN') then return jsonb_build_object('status',case when effect_row.state='ACCEPTED' then 'ALREADY_ACCEPTED' else effect_row.state end,'effect_id',effect_row.id,'attempt_no',effect_row.current_attempt_no); end if;
  attempt_no := effect_row.current_attempt_no + 1;
  insert into public.external_effect_attempts(effect_id, attempt_no, claim_token_digest, claimed_by, claimed_at, lease_expires_at) values (effect_row.id, attempt_no, p_claim_token_digest, owner_id::text, now(), now() + interval '5 minutes');
  update public.external_effects set state='CLAIMED', current_attempt_no=attempt_no, effect_version=effect_version+1, updated_at=now() where id=effect_row.id returning * into effect_row;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_claimed','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
  return jsonb_build_object('status','CLAIMED','effect_id',effect_row.id,'attempt_no',attempt_no,'claim_token_digest',p_claim_token_digest,'effect_version',effect_row.effect_version);
end;
$$;

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
    result_row := jsonb_build_object('status', 'STALE_EFFECT', 'effect_id', effect_row.id, 'effect_version', effect_row.effect_version);
  elsif effect_row.state not in ('READY', 'FAILED', 'UNKNOWN') then
    result_row := jsonb_build_object('status', 'RETRY_NOT_ALLOWED', 'effect_id', effect_row.id, 'effect_version', effect_row.effect_version, 'result', effect_row.state);
  else
    select i.* into item_row from public.lead_contact_operation_items i where i.effect_id = effect_row.id;
    select o.* into operation_row from public.lead_contact_operations o where o.id = item_row.operation_id;
    attempt_no := effect_row.current_attempt_no + 1;
    claim_token_digest := encode(digest(p_idempotency_key, 'sha256'), 'hex');
    insert into public.external_effect_attempts(effect_id, attempt_no, claim_token_digest) values (effect_row.id, attempt_no, claim_token_digest);
    update public.external_effects
    set state = 'CLAIMED', current_attempt_no = attempt_no, effect_version = effect_version + 1, updated_at = now()
    where id = effect_row.id
    returning * into effect_row;
    event_result := public.append_leadflow_event_v1(jsonb_build_object(
      'event_type', 'external_effect_retry_scheduled',
      'schema_version', 1,
      'occurred_at', now(),
      'source', 'PWA',
      'stage', 'EXTERNAL_EFFECT',
      'actor_kind', 'ADVISOR',
      'actor_id', owner_id,
      'correlation_id', gen_random_uuid(),
      'idempotency_key', p_idempotency_key,
      'result', 'APPLIED',
      'aggregate_type', 'EXTERNAL_EFFECT',
      'aggregate_id', effect_row.id,
      'aggregate_version', effect_row.effect_version,
      'payload', '{}'::jsonb,
      'identity_components', jsonb_build_array(
        jsonb_build_object('name', 'aggregate_type', 'value', 'EXTERNAL_EFFECT'),
        jsonb_build_object('name', 'aggregate_id', 'value', effect_row.id),
        jsonb_build_object('name', 'aggregate_version', 'value', effect_row.effect_version)
      )
    ));
    result_row := jsonb_build_object(
      'status', 'CLAIMED',
      'effect_id', effect_row.id,
      'attempt_no', attempt_no,
      'claim_token_digest', claim_token_digest,
      'effect_version', effect_row.effect_version,
      'resource_kind', item_row.resource_kind,
      'item_key', item_row.item_key,
      'operation_id', operation_row.id
    );
  end if;

  insert into public.lead_contact_operation_commands(effect_id, idempotency_key, result)
  values (p_effect_id, p_idempotency_key, result_row);
  return result_row || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.claim_first_contact_effect_v1(uuid, text), public.retry_first_contact_effect_v1(uuid, bigint, text) from public, anon;
grant execute on function public.claim_first_contact_effect_v1(uuid, text), public.retry_first_contact_effect_v1(uuid, bigint, text) to authenticated;

commit;
