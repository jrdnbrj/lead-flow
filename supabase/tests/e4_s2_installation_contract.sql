begin;

select plan(28);

create or replace function public.e4_s2_apply_installation_migration_fixture(approved_advisor_user_id uuid)
returns void
language plpgsql
as $$
declare
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

  alter table public.leadflow_settings
    add column if not exists user_id uuid references auth.users(id) on delete restrict;

  if exists (select 1 from public.leadflow_settings where user_id is not null and user_id <> approved_advisor_user_id) then
    raise exception 'E4-S2 cannot replace an existing leadflow_settings owner';
  end if;
  update public.leadflow_settings
  set user_id = approved_advisor_user_id
  where user_id is null;

  alter table public.leadflow_settings
    alter column user_id set not null;

  create unique index if not exists leadflow_settings_user_id_key
    on public.leadflow_settings (user_id);
  create index if not exists leadflow_settings_owner_updated_at_idx
    on public.leadflow_settings (user_id, updated_at desc);
end;
$$;

select has_table('public', 'leadflow_installation', 'singleton installation table exists');
select is((select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.leadflow_installation'::regclass and attname = 'singleton' and not attisdropped), 'boolean', 'singleton is boolean');
select col_not_null('public', 'leadflow_installation', 'singleton', 'singleton is not nullable');
select col_not_null('public', 'leadflow_installation', 'advisor_user_id', 'installation owner is required');
select is((select format_type(atttypid, atttypmod) from pg_attribute where attrelid = 'public.leadflow_installation'::regclass and attname = 'advisor_user_id' and not attisdropped), 'uuid', 'installation owner is uuid');
select col_is_fk('public', 'leadflow_installation', 'advisor_user_id', 'installation owner references auth.users');
select ok((select count(*) = 1 from pg_constraint where conrelid = 'public.leadflow_installation'::regclass and contype = 'p' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.leadflow_installation'::regclass and attname = 'singleton' and not attisdropped)]::smallint[]), 'singleton has the primary key');
select ok((select count(*) = 1 from pg_constraint where conrelid = 'public.leadflow_installation'::regclass and contype = 'c' and pg_get_constraintdef(oid) in ('CHECK (singleton)', 'CHECK ((singleton))')), 'singleton check rejects false');
select col_not_null('public', 'leadflow_settings', 'user_id', 'settings owner is required');
select col_is_fk('public', 'leadflow_settings', 'user_id', 'settings owner references auth.users');
select ok((select indisunique from pg_index where indexrelid = 'public.leadflow_settings_user_id_key'::regclass), 'settings owner index is truly unique');
select is((select count(*) from public.leadflow_installation), 1::bigint, 'exactly one installation row exists');
select is((select advisor_user_id from public.leadflow_installation), 'd463c836-6eeb-422a-aef8-44e725b984c8'::uuid, 'installation uses only the approved advisor id');
select ok((select not exists (select 1 from public.leadflow_settings where user_id is distinct from 'd463c836-6eeb-422a-aef8-44e725b984c8'::uuid)), 'any existing settings rows remain attached to the approved owner');

select throws_ok(
  $$insert into public.leadflow_installation (singleton, advisor_user_id) values (true, 'd463c836-6eeb-422a-aef8-44e725b984c8')$$,
  '23505',
  null,
  'duplicate singleton is rejected'
);
select throws_ok(
  $$insert into public.leadflow_installation (singleton, advisor_user_id) values (false, 'd463c836-6eeb-422a-aef8-44e725b984c8')$$,
  '23514',
  null,
  'false singleton fixture is rejected'
);
select throws_ok(
  $$insert into public.leadflow_installation (singleton, advisor_user_id) values (true, null)$$,
  '23502',
  null,
  'null advisor owner is rejected'
);
select throws_ok(
  $$update public.leadflow_installation set advisor_user_id = '00000000-0000-0000-0000-000000000001' where singleton = true$$,
  '23503',
  null,
  'unknown advisor owner is rejected by the foreign key'
);
select is((select count(*) from public.leadflow_installation), 1::bigint, 'failed conflict fixtures do not create a second singleton');
select lives_ok(
  $$select public.e4_s2_apply_installation_migration_fixture('d463c836-6eeb-422a-aef8-44e725b984c8'::uuid)$$,
  'migration fixture reruns idempotently against the approved state'
);
select throws_ok(
  $case$do $$
    begin
      drop table public.leadflow_installation;
      alter table public.leadflow_settings drop column if exists user_id;
      perform public.e4_s2_apply_installation_migration_fixture('00000000-0000-0000-0000-000000000002'::uuid);
    end
  $$;$case$,
  'E4-S2 approved advisor_user_id does not exist in auth.users',
  'migration fixture fails closed when the approved identity is missing'
);
select throws_ok(
  $case$do $$
    begin
      drop table public.leadflow_installation;
      create table public.leadflow_installation (
        singleton text not null,
        advisor_user_id uuid not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      perform public.e4_s2_apply_installation_migration_fixture('d463c836-6eeb-422a-aef8-44e725b984c8'::uuid);
    end
  $$;$case$,
  'E4-S2 existing leadflow_installation.singleton definition is incompatible',
  'migration fixture fails closed on a malformed existing singleton table'
);
select throws_ok(
  $case$do $$
    declare
      conflicting_user_id constant uuid := '00000000-0000-0000-0000-000000000003';
    begin
      insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      values (conflicting_user_id, 'authenticated', 'authenticated', 'e4-s2-conflict@example.invalid', '', now(), now(), now())
      on conflict (id) do nothing;
      update public.leadflow_installation set advisor_user_id = conflicting_user_id where singleton = true;
      perform public.e4_s2_apply_installation_migration_fixture('d463c836-6eeb-422a-aef8-44e725b984c8'::uuid);
    end
  $$;$case$,
  'E4-S2 cannot replace an existing advisor_user_id',
  'migration fixture fails closed on a conflicting existing singleton owner'
);
select throws_ok(
  $case$do $$
    declare
      conflicting_user_id constant uuid := '00000000-0000-0000-0000-000000000004';
    begin
      insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      values (conflicting_user_id, 'authenticated', 'authenticated', 'e4-s2-settings-conflict@example.invalid', '', now(), now(), now())
      on conflict (id) do nothing;
      insert into public.leadflow_settings (id, user_id)
      values ('default', conflicting_user_id)
      on conflict (id) do update set user_id = excluded.user_id;
      perform public.e4_s2_apply_installation_migration_fixture('d463c836-6eeb-422a-aef8-44e725b984c8'::uuid);
    end
  $$;$case$,
  'E4-S2 cannot replace an existing leadflow_settings owner',
  'migration fixture fails closed on a conflicting existing settings owner'
);
select is((select count(*) from public.leadflow_installation), 1::bigint, 'idempotent revalidation preserves singleton count');
select is((select count(*) from public.leadflow_settings), (select count(*) from public.leadflow_settings where user_id is not null), 'settings rows remain non-null and are not dropped');
select ok((select count(*) = count(distinct user_id) from public.leadflow_settings), 'settings owner values remain unique');
select ok((select not exists (select 1 from public.leadflow_installation where singleton is distinct from true)), 'no invalid singleton row remains after rejected fixtures');

select * from finish();
rollback;
