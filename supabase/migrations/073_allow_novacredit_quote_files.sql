-- Local-only Slice: allow NovaCredit documents in the existing quotation
-- pipeline. Do not apply this migration to a remote environment in this
-- development slice.
do $$
begin
  if to_regclass('public.quote_files') is not null then
    alter table public.quote_files drop constraint if exists quote_files_quote_type_check;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.quote_files'::regclass
        and conname = 'quote_files_quote_type_check'
    ) then
      alter table public.quote_files
        add constraint quote_files_quote_type_check
        check (quote_type in ('TARJETA_CREDITO', 'NOVACREDIT'));
    end if;
  end if;
end $$;

comment on column public.quote_files.quote_type is 'Quotation document type: TARJETA_CREDITO or NOVACREDIT.';
