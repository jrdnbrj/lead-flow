-- Postcompra v1: documentos del caso.
-- Forward-only. No modifica milestones ni elimina objetos de Storage.

create table if not exists public.purchase_case_documents (
  id uuid primary key default gen_random_uuid(),
  purchase_case_id uuid not null references public.purchase_cases(id) on delete restrict,
  document_type text not null check (document_type in (
    'INVOICE',
    'FONDO_VIAL',
    'RAMV',
    'PAYMENT_ORDER',
    'PAYMENT_RECEIPT',
    'REGISTRATION',
    'OTHER'
  )),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REPLACED', 'DELETED')),
  storage_path text not null unique,
  original_filename text not null check (char_length(trim(original_filename)) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  replaced_by uuid references public.purchase_case_documents(id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (replaced_by is null or replaced_by <> id),
  check (
    (status = 'ACTIVE' and replaced_by is null and deleted_at is null and deleted_by is null)
    or (status = 'REPLACED' and replaced_by is not null and deleted_at is null and deleted_by is null)
    or (status = 'DELETED' and replaced_by is null and deleted_at is not null and deleted_by is not null)
  )
);

create index if not exists purchase_case_documents_case_status_idx
  on public.purchase_case_documents (purchase_case_id, status, created_at desc);

create index if not exists purchase_case_documents_case_type_idx
  on public.purchase_case_documents (purchase_case_id, document_type, status, created_at desc);

create unique index if not exists purchase_case_documents_single_active_idx
  on public.purchase_case_documents (purchase_case_id, document_type)
  where status = 'ACTIVE' and document_type in ('INVOICE', 'FONDO_VIAL', 'RAMV', 'REGISTRATION');

alter table public.purchase_case_documents enable row level security;

revoke all on table public.purchase_case_documents from public, anon, authenticated;
grant select on table public.purchase_case_documents to authenticated;

drop policy if exists purchase_case_documents_owner_read on public.purchase_case_documents;
create policy purchase_case_documents_owner_read on public.purchase_case_documents
  for select to authenticated
  using (exists (
    select 1
    from public.purchase_cases cases
    join public.leads leads on leads.id = cases.lead_id
    where cases.id = purchase_case_documents.purchase_case_id
      and leads.user_id = auth.uid()
      and leads.deleted_at is null
  ));

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'purchase-documents') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('purchase-documents', 'purchase-documents', false, 10485760, array[
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
    ]::text[]);
  else
    update storage.buckets
    set name = 'purchase-documents',
        public = false,
        file_size_limit = 10485760,
        allowed_mime_types = array[
          'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
        ]::text[]
    where id = 'purchase-documents';
  end if;
end $$;

drop policy if exists purchase_documents_owner_read on storage.objects;
create policy purchase_documents_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'purchase-documents'
    and exists (
      select 1
      from public.purchase_case_documents documents
      join public.purchase_cases cases on cases.id = documents.purchase_case_id
      join public.leads leads on leads.id = cases.lead_id
      where documents.storage_path = storage.objects.name
        and documents.status = 'ACTIVE'
        and leads.user_id = auth.uid()
        and leads.deleted_at is null
    )
  );

create or replace function public.purchase_case_document_json_v1(document_row public.purchase_case_documents)
returns jsonb
language sql
security definer
set search_path = public, auth, extensions
as $$
  select jsonb_build_object(
    'id', document_row.id,
    'purchase_case_id', document_row.purchase_case_id,
    'document_type', document_row.document_type,
    'status', document_row.status,
    'storage_path', document_row.storage_path,
    'original_filename', document_row.original_filename,
    'mime_type', document_row.mime_type,
    'size_bytes', document_row.size_bytes,
    'replaced_by', document_row.replaced_by,
    'deleted_at', document_row.deleted_at,
    'deleted_by', document_row.deleted_by,
    'created_at', document_row.created_at,
    'created_by', document_row.created_by,
    'updated_at', document_row.updated_at
  );
$$;

create or replace function public.create_or_replace_purchase_case_document_v1(
  p_document_id uuid,
  p_purchase_case_id uuid,
  p_document_type text,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_replace_document_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  target_lead_id uuid;
  lead_row public.leads;
  purchase_row public.lead_milestones;
  case_row public.purchase_cases;
  previous_row public.purchase_case_documents;
  document_row public.purchase_case_documents;
  single_type boolean;
  result_status text := 'CREATED';
begin
  owner_id := public.leadflow_action_owner_v1();
  if auth.role() <> 'service_role' and (auth.uid() is null or owner_id is null or auth.uid() <> owner_id) then
    raise exception using errcode = '42501', message = 'ADVISOR_NOT_AUTHORIZED';
  end if;
  if p_document_id is null or p_purchase_case_id is null then
    raise exception using errcode = '22023', message = 'DOCUMENT_INPUT_REQUIRED';
  end if;
  if p_document_type is null or p_document_type not in ('INVOICE', 'FONDO_VIAL', 'RAMV', 'PAYMENT_ORDER', 'PAYMENT_RECEIPT', 'REGISTRATION', 'OTHER') then
    raise exception using errcode = '22023', message = 'DOCUMENT_TYPE_INVALID';
  end if;
  if p_mime_type is null or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'DOCUMENT_MIME_INVALID';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 10485760 then
    raise exception using errcode = '22023', message = 'DOCUMENT_SIZE_INVALID';
  end if;
  if p_original_filename is null or char_length(trim(p_original_filename)) not between 1 and 180 then
    raise exception using errcode = '22023', message = 'DOCUMENT_FILENAME_INVALID';
  end if;
  if p_storage_path is null or p_storage_path !~ (
    '^purchase-cases/' || p_purchase_case_id::text || '/' || p_document_type || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
  ) then
    raise exception using errcode = '22023', message = 'DOCUMENT_PATH_INVALID';
  end if;

  -- Keep the existing post-purchase lock order: lead -> decision -> case.
  select lead_id into target_lead_id
  from public.purchase_cases
  where id = p_purchase_case_id;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  select * into lead_row
  from public.leads
  where id = target_lead_id
    and user_id = owner_id
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into purchase_row
  from public.lead_milestones
  where lead_id = lead_row.id
    and milestone_type = 'PURCHASE_DECISION'
  for update;
  if not found or purchase_row.purchase_status <> 'PURCHASED' then
    raise exception using errcode = '42501', message = 'PURCHASE_NOT_ACTIVE';
  end if;

  select * into case_row
  from public.purchase_cases
  where id = p_purchase_case_id
    and lead_id = lead_row.id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  if exists (select 1 from public.purchase_case_documents where id = p_document_id) then
    raise exception using errcode = '23505', message = 'DOCUMENT_ID_ALREADY_EXISTS';
  end if;

  single_type := p_document_type in ('INVOICE', 'FONDO_VIAL', 'RAMV', 'REGISTRATION');
  if single_type then
    select * into previous_row
    from public.purchase_case_documents
    where purchase_case_id = case_row.id
      and document_type = p_document_type
      and status = 'ACTIVE'
    for update;

    if found and p_replace_document_id is null then
      raise exception using errcode = '22023', message = 'DOCUMENT_REPLACEMENT_REQUIRED';
    end if;
    if p_replace_document_id is not null and (not found or previous_row.id <> p_replace_document_id) then
      raise exception using errcode = '22023', message = 'DOCUMENT_REPLACEMENT_INVALID';
    end if;
    if found then
      update public.purchase_case_documents
      set status = 'REPLACED', replaced_by = p_document_id, updated_at = now()
      where id = previous_row.id;
      result_status := 'REPLACED';
    end if;
  elsif p_replace_document_id is not null then
    raise exception using errcode = '22023', message = 'DOCUMENT_REPLACEMENT_NOT_ALLOWED';
  end if;

  insert into public.purchase_case_documents (
    id, purchase_case_id, document_type, status, storage_path,
    original_filename, mime_type, size_bytes, created_by
  ) values (
    p_document_id, case_row.id, p_document_type, 'ACTIVE', p_storage_path,
    trim(p_original_filename), p_mime_type, p_size_bytes, owner_id
  ) returning * into document_row;

  return jsonb_build_object('operation', result_status) || public.purchase_case_document_json_v1(document_row);
end;
$$;

create or replace function public.delete_purchase_case_document_v1(
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  owner_id uuid;
  target_lead_id uuid;
  lead_row public.leads;
  purchase_row public.lead_milestones;
  case_row public.purchase_cases;
  document_row public.purchase_case_documents;
begin
  owner_id := public.leadflow_action_owner_v1();
  if auth.role() <> 'service_role' and (auth.uid() is null or owner_id is null or auth.uid() <> owner_id) then
    raise exception using errcode = '42501', message = 'ADVISOR_NOT_AUTHORIZED';
  end if;
  if p_document_id is null then
    raise exception using errcode = '22023', message = 'DOCUMENT_INPUT_REQUIRED';
  end if;

  select cases.lead_id into target_lead_id
  from public.purchase_case_documents documents
  join public.purchase_cases cases on cases.id = documents.purchase_case_id
  where documents.id = p_document_id;
  if not found then
    raise exception using errcode = '40400', message = 'DOCUMENT_NOT_FOUND';
  end if;

  -- Keep the existing post-purchase lock order: lead -> decision -> case -> document.
  select * into lead_row
  from public.leads
  where id = target_lead_id
    and user_id = owner_id
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'LEAD_NOT_ACTIVE_OR_NOT_OWNED';
  end if;

  select * into purchase_row
  from public.lead_milestones
  where lead_id = lead_row.id
    and milestone_type = 'PURCHASE_DECISION'
  for update;
  if not found or purchase_row.purchase_status <> 'PURCHASED' then
    raise exception using errcode = '42501', message = 'PURCHASE_NOT_ACTIVE';
  end if;

  select * into case_row
  from public.purchase_cases
  where id = (select purchase_case_id from public.purchase_case_documents where id = p_document_id)
    and lead_id = lead_row.id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'PURCHASE_CASE_NOT_FOUND';
  end if;

  select * into document_row
  from public.purchase_case_documents
  where id = p_document_id
    and purchase_case_id = case_row.id
  for update;
  if not found then
    raise exception using errcode = '40400', message = 'DOCUMENT_NOT_FOUND';
  end if;
  if document_row.status = 'DELETED' then
    return jsonb_build_object('operation', 'REPLAYED') || public.purchase_case_document_json_v1(document_row);
  end if;
  if document_row.status <> 'ACTIVE' then
    raise exception using errcode = '22023', message = 'DOCUMENT_NOT_ACTIVE';
  end if;

  update public.purchase_case_documents
  set status = 'DELETED', deleted_at = now(), deleted_by = owner_id, updated_at = now()
  where id = document_row.id
  returning * into document_row;

  return jsonb_build_object('operation', 'DELETED') || public.purchase_case_document_json_v1(document_row);
end;
$$;

revoke all on function public.purchase_case_document_json_v1(public.purchase_case_documents) from public, anon, authenticated;
revoke all on function public.create_or_replace_purchase_case_document_v1(uuid, uuid, text, text, text, text, bigint, uuid) from public, anon, authenticated;
revoke all on function public.delete_purchase_case_document_v1(uuid) from public, anon, authenticated;
grant execute on function public.create_or_replace_purchase_case_document_v1(uuid, uuid, text, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.delete_purchase_case_document_v1(uuid) to authenticated;
grant execute on function public.create_or_replace_purchase_case_document_v1(uuid, uuid, text, text, text, text, bigint, uuid) to service_role;
grant execute on function public.delete_purchase_case_document_v1(uuid) to service_role;

comment on table public.purchase_case_documents is 'Active and historical documents attached to a LeadFlow purchase case. Historical rows are soft-retained.';
comment on column public.purchase_case_documents.replaced_by is 'The newer active document that replaced this historical row.';
