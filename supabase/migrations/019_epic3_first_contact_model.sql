-- E3-S1/S2/S3: minimal first-contact operation and effect ledger.

create table if not exists public.lead_contact_operations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  operation_type text not null check (operation_type = 'FIRST_CONTACT'),
  operation_version bigint not null default 1 check (operation_version > 0),
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'RUNNING', 'PARTIAL', 'COMPLETE', 'FAILED', 'UNKNOWN')),
  configuration_digest text not null check (configuration_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, operation_type)
);

create table if not exists public.external_effects (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  effect_kind text not null check (effect_kind = 'WHATSAPP_FIRST_CONTACT'),
  business_key text not null,
  state text not null default 'READY' check (state in ('READY', 'CLAIMED', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
  effect_version bigint not null default 1 check (effect_version > 0),
  current_attempt_no integer not null default 0 check (current_attempt_no >= 0),
  item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, effect_kind, business_key)
);

create table if not exists public.lead_contact_operation_items (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.lead_contact_operations(id) on delete restrict,
  resource_kind text not null check (resource_kind in ('MESSAGE', 'PHOTOS', 'TECHNICAL_SHEET')),
  item_key text not null,
  resource_version text not null,
  availability text not null check (availability in ('AVAILABLE', 'NOT_AVAILABLE')),
  result text check (result is null or result in ('ACCEPTED', 'FAILED', 'UNKNOWN', 'NOT_AVAILABLE')),
  effect_id uuid references public.external_effects(id) on delete restrict,
  lead_message_id uuid references public.lead_messages(id) on delete restrict,
  provider_message_id text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, item_key)
);

alter table public.external_effects
  add constraint external_effects_item_fk
  foreign key (item_id) references public.lead_contact_operation_items(id) on delete restrict;

create table if not exists public.external_effect_attempts (
  effect_id uuid not null references public.external_effects(id) on delete restrict,
  attempt_no integer not null check (attempt_no > 0),
  claim_token_digest text not null check (claim_token_digest ~ '^[0-9a-f]{64}$'),
  request_started_at timestamptz,
  completed_at timestamptz,
  result_kind text check (result_kind is null or result_kind in ('ACCEPTED', 'FAILED', 'UNKNOWN')),
  provider_message_id text,
  provider_status text,
  created_at timestamptz not null default now(),
  primary key (effect_id, attempt_no),
  unique (claim_token_digest)
);

create table if not exists public.external_effect_attempt_observations (
  id uuid primary key default gen_random_uuid(),
  effect_id uuid not null,
  attempt_no integer not null,
  observation_kind text not null check (observation_kind in ('CLAIMED', 'ACCEPTED', 'FAILED', 'UNKNOWN')),
  source text not null check (source in ('PWA', 'SYSTEM', 'WEBHOOK')),
  provider_status text,
  evidence_digest text check (evidence_digest is null or evidence_digest ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null default gen_random_uuid(),
  observed_at timestamptz not null default now(),
  foreign key (effect_id, attempt_no) references public.external_effect_attempts(effect_id, attempt_no) on delete restrict,
  unique (effect_id, attempt_no, observation_kind, source, correlation_id)
);

create index if not exists lead_contact_operation_items_operation_idx on public.lead_contact_operation_items(operation_id);
create index if not exists external_effect_attempts_effect_idx on public.external_effect_attempts(effect_id, attempt_no desc);

alter table public.lead_contact_operations enable row level security;
alter table public.lead_contact_operation_items enable row level security;
alter table public.external_effects enable row level security;
alter table public.external_effect_attempts enable row level security;
alter table public.external_effect_attempt_observations enable row level security;

create or replace function public.leadflow_first_contact_owner_v1(p_lead_id uuid)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare owner_id uuid;
begin
  select advisor_user_id into owner_id from public.leadflow_installation where singleton = true and advisor_user_id = auth.uid();
  if owner_id is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.leads where id = p_lead_id and user_id = owner_id and deleted_at is null) then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;
  return owner_id;
end;
$$;

revoke all on function public.leadflow_first_contact_owner_v1(uuid) from public, anon;
grant execute on function public.leadflow_first_contact_owner_v1(uuid) to authenticated;
