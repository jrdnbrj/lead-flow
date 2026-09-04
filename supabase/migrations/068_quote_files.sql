-- Slice B: immutable client-facing credit-card quotation files.
-- This migration does not alter leads, First Contact, Push, reminders, or
-- any existing Storage bucket. The service-role server boundary is the only
-- writer used by LeadFlow; authenticated browsers receive read-only access
-- to their own metadata and files.
create table if not exists public.quote_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  generated_by uuid not null references auth.users(id) on delete restrict,
  quote_type text not null check (quote_type = 'TARJETA_CREDITO'),
  model_id text not null references public.car_models(id) on delete restrict,
  model_name_snapshot text not null check (char_length(trim(model_name_snapshot)) between 1 and 120),
  storage_path text not null unique,
  file_name text not null check (char_length(trim(file_name)) between 1 and 180),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  rules_version text not null,
  generated_at timestamptz not null default now()
);

create index if not exists quote_files_owner_lead_generated_idx
  on public.quote_files (generated_by, lead_id, generated_at desc);

create index if not exists quote_files_model_idx
  on public.quote_files (model_id);

alter table public.quote_files enable row level security;

revoke all on table public.quote_files from anon, authenticated;
grant select on table public.quote_files to authenticated;

drop policy if exists "quote_files_select_own" on public.quote_files;
create policy "quote_files_select_own"
on public.quote_files for select to authenticated
using (generated_by = auth.uid());

-- Keep the document bucket private. The existence guard makes the migration
-- safe to re-run if the bucket was created during a controlled preflight.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'quotations') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('quotations', 'quotations', false, 5242880, array['application/pdf']::text[]);
  end if;
end $$;

drop policy if exists "quotations_select_own" on storage.objects;
create policy "quotations_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'quotations'
  and exists (
    select 1
    from public.quote_files
    where quote_files.storage_path = storage.objects.name
      and quote_files.generated_by = auth.uid()
  )
);

comment on table public.quote_files is 'Immutable LeadFlow customer-facing quotation PDFs generated explicitly by an advisor.';
comment on column public.quote_files.snapshot is 'Normalized server-calculated document snapshot used for traceability and future freshness checks.';
