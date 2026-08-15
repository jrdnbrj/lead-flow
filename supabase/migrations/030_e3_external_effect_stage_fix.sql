-- E3 runtime fix: external-effect lifecycle events use the registry's
-- EXTERNAL_EFFECT stage. Keep FIRST_CONTACT for operation-level events.

create or replace function public.claim_first_contact_effect_v1(p_effect_id uuid, p_claim_token_digest text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare owner_id uuid; effect_row public.external_effects; attempt_no integer; event_result jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_claim_token_digest is null or p_claim_token_digest !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023', message='CLAIM_TOKEN_DIGEST_INVALID'; end if;
  select e.* into effect_row from public.external_effects e join public.lead_contact_operation_items i on i.effect_id=e.id join public.lead_contact_operations o on o.id=i.operation_id join public.leads l on l.id=o.lead_id where e.id=p_effect_id and l.user_id=owner_id and l.deleted_at is null for update;
  if not found then raise exception using errcode='42501', message='EFFECT_NOT_FOUND_OR_NOT_OWNED'; end if;
  if effect_row.state not in ('READY','FAILED') then return jsonb_build_object('status',case when effect_row.state='ACCEPTED' then 'ALREADY_ACCEPTED' else effect_row.state end,'effect_id',effect_row.id,'attempt_no',effect_row.current_attempt_no); end if;
  attempt_no := effect_row.current_attempt_no + 1;
  insert into public.external_effect_attempts(effect_id, attempt_no, claim_token_digest, claimed_by, claimed_at, lease_expires_at) values (effect_row.id, attempt_no, p_claim_token_digest, owner_id::text, now(), now() + interval '5 minutes');
  update public.external_effects set state='CLAIMED', current_attempt_no=attempt_no, effect_version=effect_version+1, updated_at=now() where id=effect_row.id returning * into effect_row;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_claimed','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
  return jsonb_build_object('status','CLAIMED','effect_id',effect_row.id,'attempt_no',attempt_no,'claim_token_digest',p_claim_token_digest,'effect_version',effect_row.effect_version);
end;
$$;
create or replace function public.retry_first_contact_effect_v1(p_effect_id uuid, p_expected_effect_version bigint, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare owner_id uuid; effect_row public.external_effects; item_row public.lead_contact_operation_items; operation_row public.lead_contact_operations; attempt_no integer; claim_token_digest text; result_row jsonb; event_result jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) not between 16 and 200 then raise exception using errcode='22023', message='FIRST_CONTACT_RETRY_INPUT_REQUIRED'; end if;
  select c.result into result_row from public.lead_contact_operation_commands c join public.external_effects e on e.id=c.effect_id join public.lead_contact_operation_items i on i.effect_id=e.id join public.lead_contact_operations o on o.id=i.operation_id join public.leads l on l.id=o.lead_id where c.idempotency_key=p_idempotency_key and l.user_id=owner_id and l.deleted_at is null;
  if found then return result_row || jsonb_build_object('replayed',true); end if;
  select e.* into effect_row from public.external_effects e join public.lead_contact_operation_items i on i.effect_id=e.id join public.lead_contact_operations o on o.id=i.operation_id join public.leads l on l.id=o.lead_id where e.id=p_effect_id and l.user_id=owner_id and l.deleted_at is null for update;
  if not found then raise exception using errcode='42501', message='EFFECT_NOT_FOUND_OR_NOT_OWNED'; end if;
  if p_expected_effect_version is not null and effect_row.effect_version <> p_expected_effect_version then result_row:=jsonb_build_object('status','STALE_EFFECT','effect_id',effect_row.id,'effect_version',effect_row.effect_version);
  elsif effect_row.state <> 'FAILED' then result_row:=jsonb_build_object('status','RETRY_NOT_ALLOWED','effect_id',effect_row.id,'effect_version',effect_row.effect_version,'result',effect_row.state);
  else
    select i.* into item_row from public.lead_contact_operation_items i where i.effect_id=effect_row.id; select o.* into operation_row from public.lead_contact_operations o where o.id=item_row.operation_id;
    attempt_no:=effect_row.current_attempt_no+1; claim_token_digest:=encode(digest(p_idempotency_key,'sha256'),'hex');
    insert into public.external_effect_attempts(effect_id,attempt_no,claim_token_digest,claimed_by,claimed_at,lease_expires_at) values(effect_row.id,attempt_no,claim_token_digest,owner_id::text,now(),now()+interval '5 minutes');
    update public.external_effects set state='CLAIMED',current_attempt_no=attempt_no,effect_version=effect_version+1,updated_at=now() where id=effect_row.id returning * into effect_row;
    event_result:=public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_retry_scheduled','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_idempotency_key,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
    result_row:=jsonb_build_object('status','CLAIMED','effect_id',effect_row.id,'attempt_no',attempt_no,'claim_token_digest',claim_token_digest,'effect_version',effect_row.effect_version,'resource_kind',item_row.resource_kind,'item_key',item_row.item_key,'operation_id',operation_row.id);
  end if;
  insert into public.lead_contact_operation_commands(effect_id,idempotency_key,result) values(p_effect_id,p_idempotency_key,result_row);
  return result_row || jsonb_build_object('replayed',false);
end;
$$;

create or replace function public.begin_first_contact_effect_io_v1(
  p_effect_id uuid, p_attempt_no integer, p_claim_token_digest text, p_payload_digest text default null
)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare owner_id uuid; effect_row public.external_effects; attempt_row public.external_effect_attempts; event_result jsonb;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_payload_digest is not null and p_payload_digest !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023', message = 'PAYLOAD_DIGEST_INVALID'; end if;
  select e.* into effect_row from public.external_effects e join public.lead_contact_operation_items i on i.effect_id=e.id join public.lead_contact_operations o on o.id=i.operation_id join public.leads l on l.id=o.lead_id where e.id=p_effect_id and l.user_id=owner_id and l.deleted_at is null for update;
  if not found then raise exception using errcode='42501', message='EFFECT_NOT_FOUND_OR_NOT_OWNED'; end if;
  select * into attempt_row from public.external_effect_attempts where effect_id=p_effect_id and attempt_no=p_attempt_no and claim_token_digest=p_claim_token_digest for update;
  if not found or effect_row.state <> 'CLAIMED' then raise exception using errcode='40001', message='STALE_EFFECT_ATTEMPT'; end if;
  if attempt_row.lease_expires_at is not null and attempt_row.lease_expires_at <= now() then raise exception using errcode='40001', message='STALE_EFFECT_ATTEMPT'; end if;
  if attempt_row.request_started_at is not null then return jsonb_build_object('status','ALREADY_STARTED','effect_id',p_effect_id,'attempt_no',p_attempt_no); end if;
  if attempt_row.payload_digest is not null and attempt_row.payload_digest <> p_payload_digest then raise exception using errcode='40001', message='PAYLOAD_DIGEST_MISMATCH'; end if;
  update public.external_effect_attempts set request_started_at=now(), payload_digest=coalesce(payload_digest,p_payload_digest) where effect_id=p_effect_id and attempt_no=p_attempt_no;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_io_started','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':begin','result','APPLIED','payload',jsonb_build_object('provider',effect_row.provider),'identity_components',jsonb_build_array(jsonb_build_object('name','effect_id','value',p_effect_id),jsonb_build_object('name','attempt_no','value',p_attempt_no),jsonb_build_object('name','marker','value','BEGIN_IO'))));
  return jsonb_build_object('status','STARTED','effect_id',p_effect_id,'attempt_no',p_attempt_no);
end;
$$;

create or replace function public.record_first_contact_effect_result_v1(p_effect_id uuid, p_attempt_no integer, p_claim_token_digest text, p_result_kind text, p_provider_message_id text default null, p_provider_status text default null, p_message_body text default null)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare owner_id uuid; effect_row public.external_effects; item_row public.lead_contact_operation_items; operation_row public.lead_contact_operations; lead_row public.leads; attempt_row public.external_effect_attempts; next_operation_status text; resource_results jsonb; event_result jsonb; message_id uuid;
begin
  owner_id := public.leadflow_action_owner_v1();
  if p_result_kind not in ('ACCEPTED','FAILED','UNKNOWN') then raise exception using errcode='22023', message='EFFECT_RESULT_INVALID'; end if;
  if p_result_kind = 'ACCEPTED' and nullif(btrim(p_provider_message_id),'') is null then raise exception using errcode='22023', message='PROVIDER_MESSAGE_ID_REQUIRED'; end if;
  select e.* into effect_row from public.external_effects e join public.lead_contact_operation_items i on i.effect_id=e.id join public.lead_contact_operations o on o.id=i.operation_id join public.leads l on l.id=o.lead_id where e.id=p_effect_id and l.user_id=owner_id for update;
  if not found then raise exception using errcode='42501', message='EFFECT_NOT_FOUND_OR_NOT_OWNED'; end if;
  select * into attempt_row from public.external_effect_attempts where effect_id=p_effect_id and attempt_no=p_attempt_no and claim_token_digest=p_claim_token_digest for update;
  if not found or effect_row.state <> 'CLAIMED' then raise exception using errcode='40001', message='STALE_EFFECT_ATTEMPT'; end if;
  if attempt_row.completed_at is not null then return jsonb_build_object('status','REPLAYED','effect_id',p_effect_id,'attempt_no',p_attempt_no,'result',attempt_row.result_kind); end if;
  select i.* into item_row from public.lead_contact_operation_items i where i.effect_id=p_effect_id;
  select o.* into operation_row from public.lead_contact_operations o where o.id=item_row.operation_id;
  select * into lead_row from public.leads where id=operation_row.lead_id;
  if p_result_kind = 'ACCEPTED' then
    insert into public.lead_messages(lead_id, direction, status, provider_message_id, phone, body, external_effect_id, created_at) values (lead_row.id, 'OUTBOUND', 'SENT', p_provider_message_id, lead_row.phone, p_message_body, effect_row.id, now()) returning id into message_id;
  end if;
  update public.external_effect_attempts set completed_at=now(), result_kind=p_result_kind, provider_message_id=case when p_result_kind='ACCEPTED' then p_provider_message_id else null end, provider_status=p_provider_status where effect_id=p_effect_id and attempt_no=p_attempt_no;
  update public.external_effects set state=p_result_kind, effect_version=effect_version+1, updated_at=now() where id=p_effect_id returning * into effect_row;
  update public.lead_contact_operation_items set result=p_result_kind, lead_message_id=message_id, provider_message_id=case when p_result_kind='ACCEPTED' then p_provider_message_id else null end, updated_at=now() where id=item_row.id;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_result_recorded','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':external-result:' || p_result_kind,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload',jsonb_build_object('provider',effect_row.provider),'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
  select case when count(*) filter (where result is null) > 0 then 'RUNNING' when count(*) filter (where result = 'UNKNOWN') > 0 then 'UNKNOWN' when count(*) filter (where result = 'FAILED') > 0 then 'PARTIAL' when count(*) filter (where result in ('ACCEPTED','NOT_AVAILABLE')) = count(*) then 'COMPLETE' else 'PARTIAL' end into next_operation_status from public.lead_contact_operation_items where operation_id=operation_row.id;
  update public.lead_contact_operations set status=next_operation_status, operation_version=operation_version+1, updated_at=now() where id=operation_row.id returning * into operation_row;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('resource', resource_kind, 'result', result, 'provider_message_id', case when result='ACCEPTED' then provider_message_id else null end)) order by item_key), '[]'::jsonb) into resource_results from public.lead_contact_operation_items where operation_id=operation_row.id;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','first_contact_result','schema_version',1,'occurred_at',now(),'source','PWA','stage','FIRST_CONTACT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':result:' || p_result_kind,'result',null,'aggregate_type','LEAD_CONTACT_OPERATION','aggregate_id',operation_row.id,'aggregate_version',operation_row.operation_version,'payload',jsonb_build_object('lead_id',operation_row.lead_id,'resource_results',resource_results),'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','LEAD_CONTACT_OPERATION'),jsonb_build_object('name','aggregate_id','value',operation_row.id),jsonb_build_object('name','aggregate_version','value',operation_row.operation_version))));
  return jsonb_build_object('status',p_result_kind,'effect_id',p_effect_id,'attempt_no',p_attempt_no,'operation_status',operation_row.status,'operation_version',operation_row.operation_version,'event',event_result);
end;
$$;
