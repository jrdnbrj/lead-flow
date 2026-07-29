do $$
begin
  create type public.conversation_state as enum ('NEW', 'ACTIVE', 'WAITING_CUSTOMER', 'CLOSED');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.next_action_type as enum ('CALL', 'WHATSAPP', 'QUOTE', 'OTHER');
exception when duplicate_object then null;
end $$;

alter type public.whatsapp_status add value if not exists 'SERVER_ACK';
alter type public.whatsapp_status add value if not exists 'DELIVERY_ACK';
alter type public.whatsapp_status add value if not exists 'READ';
alter type public.whatsapp_status add value if not exists 'PLAYED';
alter type public.whatsapp_status add value if not exists 'RECEIVED';

alter table public.leads
  add column if not exists conversation_state public.conversation_state not null default 'NEW',
  add column if not exists next_action_at timestamptz,
  add column if not exists next_action_type public.next_action_type,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists last_agent_message_at timestamptz,
  add column if not exists last_customer_message_preview text;

create index if not exists leads_next_action_idx on public.leads (next_action_at)
where next_action_at is not null;

create index if not exists leads_conversation_state_idx on public.leads (conversation_state);

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider_message_id text,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  status text not null default 'PENDING',
  body text,
  phone text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  raw_payload jsonb
);

create unique index if not exists lead_messages_provider_id_idx
on public.lead_messages (provider_message_id)
where provider_message_id is not null;

create index if not exists lead_messages_lead_created_idx
on public.lead_messages (lead_id, created_at desc);

alter table public.lead_messages enable row level security;

drop policy if exists "lead_messages_select_own" on public.lead_messages;
create policy "lead_messages_select_own"
on public.lead_messages for select to authenticated
using (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_messages_insert_own" on public.lead_messages;
create policy "lead_messages_insert_own"
on public.lead_messages for insert to authenticated
with check (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_messages_update_own" on public.lead_messages;
create policy "lead_messages_update_own"
on public.lead_messages for update to authenticated
using (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id = auth.uid()
))
with check (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id = auth.uid()
));

drop policy if exists "lead_messages_select_anonymous" on public.lead_messages;
create policy "lead_messages_select_anonymous"
on public.lead_messages for select to anon
using (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id is null
));

drop policy if exists "lead_messages_insert_anonymous" on public.lead_messages;
create policy "lead_messages_insert_anonymous"
on public.lead_messages for insert to anon
with check (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id is null
));

drop policy if exists "lead_messages_update_anonymous" on public.lead_messages;
create policy "lead_messages_update_anonymous"
on public.lead_messages for update to anon
using (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id is null
))
with check (exists (
  select 1 from public.leads
  where leads.id = lead_messages.lead_id
    and leads.user_id is null
));

comment on column public.leads.next_action_at is 'Start of the selected calendar day in the seller timezone; this is a reminder, not an outbound job.';
comment on table public.lead_messages is 'LeadFlow-owned message ledger for Evolution status updates and customer replies.';
