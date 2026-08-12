-- E4-S6: provider message identity is scoped to the trusted Evolution instance.
alter table public.lead_messages
  add column if not exists evolution_instance text;

drop index if exists public.lead_messages_provider_id_idx;
create unique index if not exists lead_messages_instance_provider_id_idx
on public.lead_messages (evolution_instance, provider_message_id)
where evolution_instance is not null and provider_message_id is not null;

comment on column public.lead_messages.evolution_instance is
  'Trusted server-side Evolution instance name used with provider_message_id for deduplication.';
