-- Slice C: isolated, server-only ledger for explicitly confirmed quotation sends.
-- This migration does not alter First Contact, Push, reminders, Evolution
-- configuration, or any existing quotation file/history row.

create table if not exists public.quote_file_sends (
  id uuid primary key default gen_random_uuid(),
  quote_file_id uuid not null references public.quote_files(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete restrict,
  generated_by uuid not null references auth.users(id) on delete restrict,
  recipient_phone text not null check (char_length(trim(recipient_phone)) between 7 and 32),
  evolution_instance text not null check (char_length(trim(evolution_instance)) between 1 and 120),
  idempotency_key text not null unique check (char_length(trim(idempotency_key)) between 10 and 240),
  status text not null check (status in ('CLAIMED', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
  attempt_no integer not null default 1 check (attempt_no > 0),
  claim_token_digest text not null check (char_length(trim(claim_token_digest)) between 32 and 128),
  provider_message_id text,
  provider_status text,
  result_payload jsonb check (result_payload is null or jsonb_typeof(result_payload) = 'object'),
  error_code text,
  error_message text,
  claimed_at timestamptz not null default now(),
  io_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ACCEPTED' and provider_message_id is not null) or status <> 'ACCEPTED')
);

create index if not exists quote_file_sends_quote_file_idx
  on public.quote_file_sends (quote_file_id, created_at desc);

create index if not exists quote_file_sends_lead_idx
  on public.quote_file_sends (lead_id, created_at desc);

alter table public.quote_file_sends enable row level security;

-- The browser must never read or write the send ledger directly. Server-only
-- actions use the service role through the two narrowly scoped RPC boundaries.
revoke all on table public.quote_file_sends from anon, authenticated;
drop policy if exists "quote_file_sends_server_only" on public.quote_file_sends;

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

    if not found then
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

  if send_row.status = 'ACCEPTED' then
    claim_action := 'REPLAYED';
  elsif send_row.status = 'UNKNOWN' then
    claim_action := 'BLOCKED_UNKNOWN';
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

create or replace function public.record_quote_file_send_result_v1(
  p_send_id uuid,
  p_attempt_no integer,
  p_claim_token_digest text,
  p_result_kind text,
  p_provider_message_id text default null,
  p_provider_status text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_result_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  send_row public.quote_file_sends%rowtype;
begin
  if p_result_kind is null or p_result_kind not in ('ACCEPTED', 'FAILED', 'UNKNOWN') then
    raise exception using message = 'QUOTE_SEND_RESULT_INVALID';
  end if;

  if p_result_kind = 'ACCEPTED' and nullif(trim(p_provider_message_id), '') is null then
    raise exception using message = 'QUOTE_SEND_PROVIDER_ID_REQUIRED';
  end if;

  select *
    into send_row
    from public.quote_file_sends
   where id = p_send_id
     and attempt_no = p_attempt_no
     and status = 'CLAIMED'
     and claim_token_digest = trim(p_claim_token_digest)
   for update;

  if not found then
    raise exception using message = 'QUOTE_SEND_CLAIM_FENCE_REJECTED';
  end if;

  update public.quote_file_sends
     set status = p_result_kind,
         provider_message_id = case when p_result_kind = 'ACCEPTED' then trim(p_provider_message_id) else null end,
         provider_status = nullif(trim(p_provider_status), ''),
         result_payload = case when p_result_payload is null then null when jsonb_typeof(p_result_payload) = 'object' then p_result_payload else '{}'::jsonb end,
         error_code = case when p_result_kind = 'ACCEPTED' then null else nullif(trim(p_error_code), '') end,
         error_message = case when p_result_kind = 'ACCEPTED' then null else left(nullif(trim(p_error_message), ''), 500) end,
         completed_at = now(),
         updated_at = now()
   where id = send_row.id
   returning * into send_row;

  return jsonb_build_object(
    'send_id', send_row.id,
    'attempt_no', send_row.attempt_no,
    'status', send_row.status,
    'provider_message_id', send_row.provider_message_id,
    'completed_at', send_row.completed_at
  );
end;
$$;

create or replace function public.begin_quote_file_send_io_v1(
  p_send_id uuid,
  p_attempt_no integer,
  p_claim_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  send_row public.quote_file_sends%rowtype;
begin
  select *
    into send_row
    from public.quote_file_sends
   where id = p_send_id
     and attempt_no = p_attempt_no
     and status = 'CLAIMED'
     and claim_token_digest = trim(p_claim_token_digest)
   for update;

  if not found then
    raise exception using message = 'QUOTE_SEND_CLAIM_FENCE_REJECTED';
  end if;

  update public.quote_file_sends
     set io_started_at = coalesce(io_started_at, now()),
         updated_at = now()
   where id = send_row.id
   returning * into send_row;

  return jsonb_build_object(
    'send_id', send_row.id,
    'attempt_no', send_row.attempt_no,
    'io_started_at', send_row.io_started_at
  );
end;
$$;

revoke all on function public.claim_quote_file_send_v1(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.begin_quote_file_send_io_v1(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.record_quote_file_send_result_v1(uuid, integer, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_quote_file_send_v1(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.begin_quote_file_send_io_v1(uuid, integer, text) to service_role;
grant execute on function public.record_quote_file_send_result_v1(uuid, integer, text, text, text, text, text, text, jsonb) to service_role;

comment on table public.quote_file_sends is 'Server-only idempotent ledger for explicitly confirmed quotation document sends.';
comment on column public.quote_file_sends.idempotency_key is 'Stable quote file plus normalized recipient identity; accepted rows are never resent.';
comment on column public.quote_file_sends.claim_token_digest is 'One-way claim fence; raw claim tokens never persist.';
