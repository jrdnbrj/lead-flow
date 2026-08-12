-- Additive AD-7 alignment for the implemented FIRST_CONTACT slice.

alter table public.external_effects
  add column if not exists user_id uuid references auth.users(id) on delete restrict,
  add column if not exists provider text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists review_required boolean not null default false;

update public.external_effects e
set user_id = coalesce(l.user_id, (select advisor_user_id from public.leadflow_installation where singleton = true)),
    provider = coalesce(e.provider, 'EVOLUTION')
from public.leads l
where l.id = e.lead_id
  and (e.user_id is null or e.provider is null);

do $$
begin
  if exists (select 1 from public.external_effects where user_id is null or provider is null) then
    raise exception 'EXTERNAL_EFFECT_OWNER_OR_PROVIDER_MISSING';
  end if;
end;
$$;

alter table public.external_effects
  alter column user_id set not null,
  alter column provider set not null,
  alter column provider set default 'EVOLUTION';

alter table public.external_effects
  add constraint external_effects_provider_check check (provider in ('EVOLUTION'));

create unique index if not exists external_effects_owner_identity_idx
  on public.external_effects (user_id, effect_kind, business_key);

alter table public.external_effect_attempts
  add column if not exists claimed_by text,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists payload_digest text;

alter table public.external_effect_attempts
  add constraint external_effect_attempts_payload_digest_check
  check (payload_digest is null or payload_digest ~ '^[0-9a-f]{64}$');

alter table public.lead_messages
  add column if not exists external_effect_id uuid references public.external_effects(id) on delete restrict;

create unique index if not exists lead_messages_external_effect_idx
  on public.lead_messages (external_effect_id)
  where external_effect_id is not null;

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
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_claimed','schema_version',1,'occurred_at',now(),'source','PWA','stage','FIRST_CONTACT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
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
    event_result:=public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_retry_scheduled','schema_version',1,'occurred_at',now(),'source','PWA','stage','FIRST_CONTACT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_idempotency_key,'result','APPLIED','aggregate_type','EXTERNAL_EFFECT','aggregate_id',effect_row.id,'aggregate_version',effect_row.effect_version,'payload','{}'::jsonb,'identity_components',jsonb_build_array(jsonb_build_object('name','aggregate_type','value','EXTERNAL_EFFECT'),jsonb_build_object('name','aggregate_id','value',effect_row.id),jsonb_build_object('name','aggregate_version','value',effect_row.effect_version))));
    result_row:=jsonb_build_object('status','CLAIMED','effect_id',effect_row.id,'attempt_no',attempt_no,'claim_token_digest',claim_token_digest,'effect_version',effect_row.effect_version,'resource_kind',item_row.resource_kind,'item_key',item_row.item_key,'operation_id',operation_row.id);
  end if;
  insert into public.lead_contact_operation_commands(effect_id,idempotency_key,result) values(p_effect_id,p_idempotency_key,result_row);
  return result_row || jsonb_build_object('replayed',false);
end;
$$;

revoke all on function public.claim_first_contact_effect_v1(uuid, text), public.retry_first_contact_effect_v1(uuid, bigint, text) from public, anon;
grant execute on function public.claim_first_contact_effect_v1(uuid, text), public.retry_first_contact_effect_v1(uuid, bigint, text) to authenticated;

drop function if exists public.begin_first_contact_effect_io_v1(uuid, integer, text);

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
  event_result := public.append_leadflow_event_v1(jsonb_build_object('event_type','external_effect_io_started','schema_version',1,'occurred_at',now(),'source','PWA','stage','FIRST_CONTACT','actor_kind','ADVISOR','actor_id',owner_id,'correlation_id',gen_random_uuid(),'idempotency_key',p_claim_token_digest || ':begin','result','APPLIED','payload',jsonb_build_object('provider',effect_row.provider),'identity_components',jsonb_build_array(jsonb_build_object('name','effect_id','value',p_effect_id),jsonb_build_object('name','attempt_no','value',p_attempt_no),jsonb_build_object('name','marker','value','BEGIN_IO'))));
  return jsonb_build_object('status','STARTED','effect_id',p_effect_id,'attempt_no',p_attempt_no);
end;
$$;

revoke all on function public.begin_first_contact_effect_io_v1(uuid, integer, text, text) from public, anon;
grant execute on function public.begin_first_contact_effect_io_v1(uuid, integer, text, text) to authenticated;
