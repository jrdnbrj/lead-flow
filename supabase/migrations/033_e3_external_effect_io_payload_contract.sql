-- E3 runtime fix: keep IO-start payload exactly aligned with the registry.

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
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_io_started','schema_version',1,'occurred_at',now(),'source','PWA','stage','EXTERNAL_EFFECT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':begin','result','APPLIED','payload',jsonb_build_object('effect_id',p_effect_id,'attempt_no',p_attempt_no),'identity_components',jsonb_build_array(jsonb_build_object('name','effect_id','value',p_effect_id),jsonb_build_object('name','attempt_no','value',p_attempt_no),jsonb_build_object('name','marker','value','BEGIN_IO'))));
  return jsonb_build_object('status','STARTED','effect_id',p_effect_id,'attempt_no',p_attempt_no);
end;
$$;
