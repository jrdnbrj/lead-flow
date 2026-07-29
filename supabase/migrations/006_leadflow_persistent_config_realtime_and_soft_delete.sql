alter table public.leads
  add column if not exists deleted_at timestamptz;

create index if not exists leads_active_created_at_idx
on public.leads (created_at desc)
where deleted_at is null;

drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own"
on public.leads for select to authenticated
using (user_id = auth.uid() and deleted_at is null);

drop policy if exists "leads_select_anonymous" on public.leads;
create policy "leads_select_anonymous"
on public.leads for select to anon
using (user_id is null and deleted_at is null);

create table if not exists public.leadflow_settings (
  id text primary key default 'default' check (id = 'default'),
  whatsapp_message_template text,
  seller_name text,
  seller_phone text,
  seller_email text,
  seller_company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_leadflow_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leadflow_settings_touch_updated_at on public.leadflow_settings;
create trigger leadflow_settings_touch_updated_at
before update on public.leadflow_settings
for each row execute function public.touch_leadflow_settings_updated_at();

alter table public.leadflow_settings enable row level security;

-- This table is intentionally accessible only through the server-side service role.
-- The browser never receives or uses that key.
drop policy if exists "leadflow_settings_select" on public.leadflow_settings;
drop policy if exists "leadflow_settings_insert" on public.leadflow_settings;
drop policy if exists "leadflow_settings_update" on public.leadflow_settings;

do $$
begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lead_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.lead_follow_up_actions;
exception when duplicate_object then null;
end $$;

comment on column public.leads.deleted_at is 'Logical deletion timestamp. Deleted contacts are excluded from the dashboard, reminders and inbound webhook matching.';
comment on table public.leadflow_settings is 'Persistent single-seller LeadFlow configuration. Empty fields fall back to environment defaults.';
