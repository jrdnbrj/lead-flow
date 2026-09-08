-- Fix the first quotation-send claim and recover abandoned pre-IO claims.
-- The original 070 function treated a newly inserted CLAIMED row as already
-- in progress, so the first send never reached provider IO.

create or replace function public.claim_quote_file_send_v1(
  p_quote_file_id uuid,
  p_lead_id uuid,
  p_generated_by uuid,
  p_recipient_phone text,
  p_evolution_instance text,
  p_idempotency_key text,
  p_claim_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_row public.quote_files%rowtype;
  send_row public.quote_file_sends%rowtype;
  claim_action text;
  created_new boolean := false;
begin
  if p_quote_file_id is null or p_lead_id is null or p_generated_by is null
     or nullif(trim(p_recipient_phone), '') is null
     or nullif(trim(p_evolution_instance), '') is null
     or nullif(trim(p_idempotency_key), '') is null
     or nullif(trim(p_claim_token_digest), '') is null then
    raise exception using message = 'QUOTE_SEND_INPUT_INVALID';
  end if;

  select q.*
    into quote_row
    from public.quote_files q
    join public.leads l on l.id = q.lead_id
   where q.id = p_quote_file_id
     and q.lead_id = p_lead_id
     and q.generated_by = p_generated_by
     and l.deleted_at is null
   for update;

  if not found then
    raise exception using message = 'QUOTE_FILE_NOT_OWNED';
  end if;

  select *
    into send_row
    from public.quote_file_sends
   where idempotency_key = p_idempotency_key
   for update;

  if not found then
    insert into public.quote_file_sends (
      quote_file_id, lead_id, generated_by, recipient_phone,
      evolution_instance, idempotency_key, status, attempt_no,
      claim_token_digest, claimed_at, updated_at
    ) values (
      p_quote_file_id, p_lead_id, p_generated_by, trim(p_recipient_phone),
      trim(p_evolution_instance), trim(p_idempotency_key), 'CLAIMED', 1,
      trim(p_claim_token_digest), now(), now()
    )
    on conflict (idempotency_key) do nothing
    returning * into send_row;

    if found then
      created_new := true;
    else
      select *
        into send_row
        from public.quote_file_sends
       where idempotency_key = p_idempotency_key
       for update;
    end if;
  end if;

  if send_row.quote_file_id <> p_quote_file_id
     or send_row.lead_id <> p_lead_id
     or send_row.generated_by <> p_generated_by
     or send_row.recipient_phone <> trim(p_recipient_phone)
     or send_row.evolution_instance <> trim(p_evolution_instance) then
    raise exception using message = 'QUOTE_SEND_IDENTITY_MISMATCH';
  end if;

  if created_new then
    claim_action := 'CLAIMED';
  elsif send_row.status = 'ACCEPTED' then
    claim_action := 'REPLAYED';
  elsif send_row.status = 'UNKNOWN' then
    claim_action := 'BLOCKED_UNKNOWN';
  elsif send_row.status = 'CLAIMED'
        and send_row.io_started_at is null
        and send_row.claimed_at < now() - interval '5 minutes' then
    update public.quote_file_sends
       set status = 'CLAIMED',
           attempt_no = send_row.attempt_no + 1,
           claim_token_digest = trim(p_claim_token_digest),
           provider_message_id = null,
           provider_status = null,
           result_payload = null,
           error_code = null,
           error_message = null,
           claimed_at = now(),
           io_started_at = null,
           completed_at = null,
           updated_at = now()
     where id = send_row.id
     returning * into send_row;
    claim_action := 'CLAIMED_RETRY';
  elsif send_row.status = 'CLAIMED' then
    claim_action := 'IN_PROGRESS';
  else
    update public.quote_file_sends
       set status = 'CLAIMED',
           attempt_no = send_row.attempt_no + 1,
           claim_token_digest = trim(p_claim_token_digest),
           provider_message_id = null,
           provider_status = null,
           result_payload = null,
           error_code = null,
           error_message = null,
           claimed_at = now(),
           io_started_at = null,
           completed_at = null,
           updated_at = now()
     where id = send_row.id
     returning * into send_row;
    claim_action := 'CLAIMED_RETRY';
  end if;

  return jsonb_build_object(
    'send_id', send_row.id,
    'quote_file_id', send_row.quote_file_id,
    'attempt_no', send_row.attempt_no,
    'status', send_row.status,
    'claim_action', claim_action,
    'provider_message_id', send_row.provider_message_id
  );
end;
$$;

revoke all on function public.claim_quote_file_send_v1(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_quote_file_send_v1(uuid, uuid, uuid, text, text, text, text) to service_role;
