-- E3 runtime fix: emit only resolved resource items in partial result events.

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
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_result_recorded','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':external-result:' || p_result_kind,'result','APPLIED','payload',jsonb_build_object('provider',effect_row.provider),'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
  select case when count(*) filter (where result is null) > 0 then 'RUNNING' when count(*) filter (where result = 'UNKNOWN') > 0 then 'UNKNOWN' when count(*) filter (where result = 'FAILED') > 0 then 'PARTIAL' when count(*) filter (where result in ('ACCEPTED','NOT_AVAILABLE')) = count(*) then 'COMPLETE' else 'PARTIAL' end into next_operation_status from public.lead_contact_operation_items where operation_id=operation_row.id;
  update public.lead_contact_operations set status=next_operation_status, operation_version=operation_version+1, updated_at=now() where id=operation_row.id returning * into operation_row;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('resource', resource_kind, 'result', result, 'provider_message_id', case when result='ACCEPTED' then provider_message_id else null end)) order by item_key), '[]'::jsonb) into resource_results from public.lead_contact_operation_items where operation_id=operation_row.id and result is not null;
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','first_contact_result','schema_version',1,'occurred_at',now(),'source','PWA','stage','FIRST_CONTACT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':result:' || p_result_kind,'result',null,'aggregate_type','LEAD_CONTACT_OPERATION','aggregate_id',operation_row.id,'aggregate_version',operation_row.operation_version,'payload',jsonb_build_object('lead_id',operation_row.lead_id,'resource_results',resource_results),'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','LEAD_CONTACT_OPERATION'),jsonb_build_object('name','aggregate_id','value',operation_row.id),jsonb_build_object('name','aggregate_version','value',operation_row.operation_version))));
  return jsonb_build_object('status',p_result_kind,'effect_id',p_effect_id,'attempt_no',p_attempt_no,'operation_status',operation_row.status,'operation_version',operation_row.operation_version,'event',event_result);
end;
$$;
