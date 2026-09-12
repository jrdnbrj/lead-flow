-- Correcciones forward-only de Postcompra v1:
-- - permite que el reemplazo enlace la fila histórica con la nueva dentro de
--   la misma transacción;
-- - alinea el path con el contrato: caso/{document_id}/{extension}.

alter table public.purchase_case_documents
  drop constraint if exists purchase_case_documents_replaced_by_fkey;

alter table public.purchase_case_documents
  add constraint purchase_case_documents_replaced_by_fkey
  foreign key (replaced_by)
  references public.purchase_case_documents(id)
  on delete restrict
  deferrable initially deferred;

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
    '^purchase-cases/' || p_purchase_case_id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
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

revoke all on function public.create_or_replace_purchase_case_document_v1(uuid, uuid, text, text, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.create_or_replace_purchase_case_document_v1(uuid, uuid, text, text, text, text, bigint, uuid) to authenticated;
grant execute on function public.create_or_replace_purchase_case_document_v1(uuid, uuid, text, text, text, text, bigint, uuid) to service_role;
