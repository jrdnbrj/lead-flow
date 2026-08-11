-- E4-S2: approved singleton identity for the one-advisor Phase A installation.
-- This migration intentionally uses the approved UUID as an explicit operation input;
-- it never discovers an identity from email, metadata, ordering, or environment.
do $$
declare
  approved_advisor_user_id constant uuid := 'a746e8b8-0f7f-48c0-b68c-cadd7fa4aeab';
  installation_count integer;
  existing_singleton boolean;
  existing_advisor_user_id uuid;
begin
  if not exists (select 1 from auth.users where id = approved_advisor_user_id) then
    raise exception 'E4-S2 approved advisor_user_id does not exist in auth.users';
  end if;

  if to_regclass('public.leadflow_installation') is null then
    create table public.leadflow_installation (
      singleton boolean primary key default true check (singleton),
      advisor_user_id uuid not null references auth.users(id) on delete restrict,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.leadflow_installation'::regclass
      and attname = 'singleton'
      and not attisdropped
      and atttypid = 'pg_catalog.bool'::regtype
      and attnotnull
  ) then
    raise exception 'E4-S2 existing leadflow_installation.singleton definition is incompatible';
  end if;
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.leadflow_installation'::regclass
      and attname = 'advisor_user_id'
      and not attisdropped
      and atttypid = 'pg_catalog.uuid'::regtype
      and attnotnull
  ) then
    raise exception 'E4-S2 existing leadflow_installation.advisor_user_id definition is incompatible';
  end if;
  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.leadflow_installation'::regclass
      and attname = 'created_at'
      and not attisdropped
      and atttypid = 'pg_catalog.timestamptz'::regtype
      and attnotnull
  ) or not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.leadflow_installation'::regclass
      and attname = 'updated_at'
      and not attisdropped
      and atttypid = 'pg_catalog.timestamptz'::regtype
      and attnotnull
  ) then
    raise exception 'E4-S2 existing leadflow_installation timestamp definitions are incompatible';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.leadflow_installation'::regclass
      and c.contype = 'p'
      and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'singleton' and not attisdropped)]::smallint[]
  ) then
    raise exception 'E4-S2 existing leadflow_installation singleton primary key is missing';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.leadflow_installation'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) in ('CHECK (singleton)', 'CHECK ((singleton))')
  ) then
    raise exception 'E4-S2 existing leadflow_installation singleton check is missing';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.leadflow_installation'::regclass
      and c.contype = 'f'
      and c.conkey = array[(select attnum from pg_attribute where attrelid = c.conrelid and attname = 'advisor_user_id' and not attisdropped)]::smallint[]
      and c.confrelid = 'auth.users'::regclass
      and c.confkey = array[(select attnum from pg_attribute where attrelid = c.confrelid and attname = 'id' and not attisdropped)]::smallint[]
      and c.confdeltype = 'r'
  ) then
    raise exception 'E4-S2 existing leadflow_installation advisor foreign key is missing';
  end if;

  select count(*) into installation_count from public.leadflow_installation;
  select singleton, advisor_user_id into existing_singleton, existing_advisor_user_id
  from public.leadflow_installation
  limit 1;

  if installation_count > 1 then
    raise exception 'E4-S2 requires exactly one leadflow_installation row';
  end if;
  if installation_count = 1 and existing_singleton is distinct from true then
    raise exception 'E4-S2 requires the existing leadflow_installation singleton to be true';
  end if;
  if installation_count = 1 and existing_advisor_user_id is distinct from approved_advisor_user_id then
    raise exception 'E4-S2 cannot replace an existing advisor_user_id';
  end if;
  if installation_count = 0 then
    insert into public.leadflow_installation (singleton, advisor_user_id)
    values (true, approved_advisor_user_id);
  end if;
end;
$$;

alter table public.leadflow_settings
  add column if not exists user_id uuid references auth.users(id) on delete restrict;

do $$
declare
  approved_advisor_user_id constant uuid := 'a746e8b8-0f7f-48c0-b68c-cadd7fa4aeab';
begin
  if exists (select 1 from public.leadflow_settings where user_id is not null and user_id <> approved_advisor_user_id) then
    raise exception 'E4-S2 cannot replace an existing leadflow_settings owner';
  end if;
  update public.leadflow_settings
  set user_id = approved_advisor_user_id
  where user_id is null;
end;
$$;

alter table public.leadflow_settings
  alter column user_id set not null;

create unique index if not exists leadflow_settings_user_id_key
  on public.leadflow_settings (user_id);
create index if not exists leadflow_settings_owner_updated_at_idx
  on public.leadflow_settings (user_id, updated_at desc);

comment on table public.leadflow_installation is 'E4-S2 singleton identity authority. Phase B makes direct replacement immutable.';
comment on column public.leadflow_settings.user_id is 'E4-S2 direct settings owner; id=default remains a compatibility key, not ownership authority.';
