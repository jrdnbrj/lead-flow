-- E4-S4: read-only ownership/backfill inventory for the current brownfield.
-- Execute only against local/preview or an explicitly approved read-only source.
-- This script creates only a temporary session table and never writes project data.

begin read only;

create temporary table _e4_s4_checks (
  check_id text not null,
  name text not null,
  mechanism text not null,
  count_value bigint,
  threshold text not null,
  null_owned_count bigint,
  status text not null check (status in ('PASS', 'FAIL', 'N/A')),
  finding text
) on commit drop;

do $$
declare
  object_name text;
  object_exists boolean;
  row_count bigint;
  null_count bigint;
  orphan_count bigint;
  mismatch_count bigint;
  duplicate_count bigint;
  soft_deleted_count bigint;
  installation_owner uuid;
begin
  -- Required brownfield tables. Missing objects are failures.
  foreach object_name in array array[
    'public.leads',
    'public.leadflow_settings',
    'public.lead_messages',
    'public.lead_follow_up_actions',
    'public.leadflow_installation'
  ] loop
    object_exists := to_regclass(object_name) is not null;
    insert into _e4_s4_checks
      values ('SCHEMA-' || replace(object_name, 'public.', ''),
              'Required table ' || object_name,
              'to_regclass(''' || object_name || ''')',
              case when object_exists then 1 else 0 end,
              'count = 1',
              0,
              case when object_exists then 'PASS' else 'FAIL' end,
              case when object_exists then null else 'required brownfield table is absent' end);
  end loop;

  -- Required columns are checked through the catalog and do not read private rows.
  foreach object_name in array array[
    'leads.user_id', 'leads.tenant_id', 'leads.deleted_at',
    'leadflow_settings.id', 'leadflow_settings.user_id',
    'lead_messages.lead_id', 'lead_messages.provider_message_id',
    'lead_follow_up_actions.lead_id'
  ] loop
    select count(*) into row_count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = split_part(object_name, '.', 1)
      and column_name = split_part(object_name, '.', 2);
    insert into _e4_s4_checks
      values ('COLUMN-' || replace(object_name, '.', '-'),
              'Required column public.' || object_name,
              'information_schema.columns', row_count, 'count = 1', 0,
              case when row_count = 1 then 'PASS' else 'FAIL' end,
              case when row_count = 1 then null else 'required brownfield column is absent' end);
  end loop;

  -- Required FKs and indexes are metadata checks; no data is exposed.
  select count(*) into row_count
  from pg_constraint c
  join pg_class child on child.oid = c.conrelid
  join pg_namespace child_ns on child_ns.oid = child.relnamespace
  join pg_class parent on parent.oid = c.confrelid
  join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
  where c.contype = 'f'
    and child_ns.nspname = 'public'
    and parent_ns.nspname = 'public'
    and pg_get_constraintdef(c.oid) in (
      'FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE',
      'FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE'
    )
    and ((child.relname = 'lead_messages' and c.conname = 'lead_messages_lead_id_fkey')
      or (child.relname = 'lead_follow_up_actions' and c.conname = 'lead_follow_up_actions_lead_id_fkey'));
  insert into _e4_s4_checks values
    ('CONSTRAINT-DERIVED-FK', 'Derived lead foreign keys', 'pg_constraint', row_count,
     'count = 2', 0, case when row_count = 2 then 'PASS' else 'FAIL' end,
     case when row_count = 2 then null else 'lead_messages/lead_follow_up_actions FK baseline is incomplete' end);

  select count(*) into row_count
  from pg_constraint c
  join pg_class child on child.oid = c.conrelid
  join pg_namespace child_ns on child_ns.oid = child.relnamespace
  where c.contype = 'f'
    and child_ns.nspname = 'public'
    and child.relname in ('leads', 'leadflow_settings')
    and c.conname in ('leads_user_id_fkey', 'leadflow_settings_user_id_fkey')
    and pg_get_constraintdef(c.oid) in (
      'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL',
      'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT'
    );
  insert into _e4_s4_checks values
    ('CONSTRAINT-OWNERSHIP-FK', 'Ownership root Auth foreign keys', 'pg_constraint exact user_id -> auth.users definitions', row_count,
     'count = 2', 0, case when row_count = 2 then 'PASS' else 'FAIL' end,
     case when row_count = 2 then null else 'leads/settings ownership FK baseline is incomplete' end);

  select count(*) into row_count
  from pg_constraint c
  join pg_class child on child.oid = c.conrelid
  join pg_namespace child_ns on child_ns.oid = child.relnamespace
  where child_ns.nspname = 'public'
    and child.relname = 'leadflow_settings'
    and ((c.contype = 'p' and c.conname = 'leadflow_settings_pkey' and pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)')
      or (c.contype = 'c' and c.conname = 'leadflow_settings_id_check' and pg_get_constraintdef(c.oid) = 'CHECK ((id = ''default''::text))'));
  insert into _e4_s4_checks values
    ('CONSTRAINT-SETTINGS-IDENTITY', 'Settings primary key and default identity constraint', 'pg_constraint exact id constraints', row_count,
     'count = 2', 0, case when row_count = 2 then 'PASS' else 'FAIL' end,
     case when row_count = 2 then null else 'leadflow_settings id baseline constraint is incomplete' end);

  select count(*) into row_count
  from pg_indexes
  where schemaname = 'public'
    and ((indexname = 'lead_messages_provider_id_idx' and indexdef like 'CREATE UNIQUE INDEX%provider_message_id%')
      or (indexname = 'leadflow_settings_user_id_key' and indexdef like 'CREATE UNIQUE INDEX%user_id%'));
  insert into _e4_s4_checks values
    ('INDEX-OWNERSHIP-IDENTITY', 'Ownership identity indexes', 'pg_indexes', row_count,
     'count = 2', 0, case when row_count = 2 then 'PASS' else 'FAIL' end,
     case when row_count = 2 then null else 'required identity/duplicate baseline index is absent' end);

  -- Installation identity is the sole expected owner authority.
  if to_regclass('public.leadflow_installation') is not null then
    select count(*), (array_agg(advisor_user_id))[1] into row_count, installation_owner
    from public.leadflow_installation;
    insert into _e4_s4_checks values
      ('IDENTITY-SINGLETON', 'Installation identity singleton', 'count(public.leadflow_installation)', row_count,
       'count = 1', 0, case when row_count = 1 then 'PASS' else 'FAIL' end,
       case when row_count = 1 then null else 'installation identity must contain exactly one row' end);
    if row_count = 1 then
      select count(*) into orphan_count from auth.users where id = installation_owner;
      insert into _e4_s4_checks values
        ('IDENTITY-AUTH-OWNER', 'Installation advisor exists in Auth', 'auth.users existence aggregate', orphan_count,
         'count = 1', 0, case when orphan_count = 1 then 'PASS' else 'FAIL' end,
         case when orphan_count = 1 then null else 'installation advisor is missing from Auth' end);
    else
      insert into _e4_s4_checks values
        ('IDENTITY-AUTH-OWNER', 'Installation advisor exists in Auth', 'auth.users existence aggregate', 0,
         'N/A while singleton is invalid', 0, 'N/A', 'identity singleton must be repaired before this check applies');
    end if;
  end if;

  -- Ownership roots: counts only, never raw private rows.
  if to_regclass('public.leads') is not null then
    execute 'select count(*), count(*) filter (where user_id is null), count(*) filter (where user_id is not null and not exists (select 1 from auth.users u where u.id = leads.user_id)) from public.leads'
      into row_count, null_count, orphan_count;
    insert into _e4_s4_checks values
      ('ROOT-LEADS-OWNERSHIP', 'leads ownership root', 'aggregate(public.leads.user_id)', row_count,
       'orphan = 0; nulls are reported candidates', null_count,
       case when orphan_count = 0 then 'PASS' else 'FAIL' end,
       case when orphan_count = 0 then null else 'leads.user_id contains orphan Auth references' end);
    execute 'select count(*) from public.leads where deleted_at is not null' into soft_deleted_count;
    insert into _e4_s4_checks values
      ('ROOT-LEADS-SOFT-DELETED', 'soft-deleted leads remain ownership roots', 'aggregate(public.leads.deleted_at)', soft_deleted_count,
       'reported; excluded only from active operational metrics', 0, 'PASS', null);
    insert into _e4_s4_checks values
      ('ROOT-LEADS-TENANT-LEGACY', 'leads.tenant_id is legacy, not ownership authority', 'column inventory and explicit ownership contract',
       null, 'N/A; never used as ownership authority', 0, 'PASS', null);
  end if;

  if to_regclass('public.leadflow_settings') is not null then
    execute 'select count(*), count(*) filter (where user_id is null), count(*) filter (where user_id is not null and not exists (select 1 from auth.users u where u.id = leadflow_settings.user_id)) from public.leadflow_settings'
      into row_count, null_count, orphan_count;
    insert into _e4_s4_checks values
      ('ROOT-SETTINGS-OWNERSHIP', 'leadflow_settings ownership root', 'aggregate(public.leadflow_settings.user_id)', row_count,
       'rows <= 1; orphan = 0', null_count,
       case when row_count <= 1 and orphan_count = 0 then 'PASS' else 'FAIL' end,
       case when row_count <= 1 and orphan_count = 0 then null else 'settings identity or owner is invalid' end);
    execute 'select count(*) from public.leadflow_settings where id is distinct from ''default''' into mismatch_count;
    insert into _e4_s4_checks values
      ('ROOT-SETTINGS-IDENTITY', 'leadflow_settings compatibility identity', 'aggregate(id = default)', mismatch_count,
       'invalid identity = 0', 0, case when mismatch_count = 0 then 'PASS' else 'FAIL' end,
       case when mismatch_count = 0 then null else 'leadflow_settings contains a non-default identity' end);
    if installation_owner is not null then
      execute 'select count(*) from public.leadflow_settings where user_id is distinct from $1' using installation_owner into mismatch_count;
      insert into _e4_s4_checks values
        ('ROOT-SETTINGS-OWNER-MATCH', 'settings owner matches installation advisor', 'aggregate owner comparison', mismatch_count,
         'mismatch = 0', 0, case when mismatch_count = 0 then 'PASS' else 'FAIL' end,
         case when mismatch_count = 0 then null else 'leadflow_settings owner mismatches installation authority' end);
    end if;
  end if;

  if to_regclass('public.lead_messages') is not null then
    execute 'select count(*) filter (where l.id is null), count(*) filter (where l.deleted_at is not null) from public.lead_messages m left join public.leads l on l.id = m.lead_id'
      into orphan_count, soft_deleted_count;
    insert into _e4_s4_checks values
      ('DERIVED-MESSAGES-INTEGRITY', 'lead_messages derived relationship', 'aggregate lead_id FK semantics', orphan_count,
       'orphan = 0; soft-deleted parents remain valid', 0,
       case when orphan_count = 0 then 'PASS' else 'FAIL' end,
       case when orphan_count = 0 then null else 'lead_messages contains orphan lead_id references' end);
    insert into _e4_s4_checks values
      ('DERIVED-MESSAGES-SOFT-DELETED', 'messages under soft-deleted leads are reported', 'aggregate parent deleted_at', soft_deleted_count,
       'reported; valid relation is not orphan', 0, 'PASS', null);
    execute 'select count(*) from (select provider_message_id from public.lead_messages where provider_message_id is not null group by provider_message_id having count(*) > 1) duplicates'
      into duplicate_count;
    insert into _e4_s4_checks values
      ('DUPLICATE-PROVIDER-MESSAGE-ID', 'provider message identity duplicates', 'group by provider_message_id where not null', duplicate_count,
       'duplicate groups = 0', 0, case when duplicate_count = 0 then 'PASS' else 'FAIL' end,
       case when duplicate_count = 0 then null else 'provider_message_id duplicate group exists' end);
  end if;

  if to_regclass('public.lead_follow_up_actions') is not null then
    execute 'select count(*) filter (where l.id is null), count(*) filter (where l.deleted_at is not null) from public.lead_follow_up_actions a left join public.leads l on l.id = a.lead_id'
      into orphan_count, soft_deleted_count;
    insert into _e4_s4_checks values
      ('DERIVED-ACTIONS-INTEGRITY', 'lead_follow_up_actions derived relationship', 'aggregate lead_id FK semantics', orphan_count,
       'orphan = 0; soft-deleted parents remain valid', 0,
       case when orphan_count = 0 then 'PASS' else 'FAIL' end,
       case when orphan_count = 0 then null else 'lead_follow_up_actions contains orphan lead_id references' end);
    insert into _e4_s4_checks values
      ('DERIVED-ACTIONS-SOFT-DELETED', 'actions under soft-deleted leads are reported', 'aggregate parent deleted_at', soft_deleted_count,
       'reported; valid relation is not orphan', 0, 'PASS', null);
  end if;

  -- Future AD-3 roots are inventory-only and never created by this recipe.
  foreach object_name in array array[
    'public.push_subscriptions', 'public.external_effects', 'public.leadflow_events',
    'public.lead_contact_operations', 'public.lead_contact_operation_items',
    'public.lead_milestones', 'public.push_deliveries'
  ] loop
    object_exists := to_regclass(object_name) is not null;
    insert into _e4_s4_checks values
      ('FUTURE-' || replace(object_name, 'public.', ''), 'Future AD-3 root inventory ' || object_name,
       'to_regclass(''' || object_name || ''')', case when object_exists then 1 else 0 end,
       'N/A when absent; no creation permitted', 0, case when object_exists then 'PASS' else 'N/A' end,
       case when object_exists then 'present; future checks remain out of scope' else 'future capability absent' end);
  end loop;
end $$;

select jsonb_build_object(
  'report_version', 'E4-S4-1.0',
  'execution', jsonb_build_object(
    'executed_at', statement_timestamp(),
    'transaction_read_only', current_setting('transaction_read_only'),
    'database', current_database(),
    'server_version', current_setting('server_version'),
    'migration_source', 'supabase/migrations/001-010',
    'identity_authority', 'public.leadflow_installation.advisor_user_id',
    'private_rows_emitted', false
  ),
  'writers_inventory', jsonb_build_array(
    'lib/leads/actions.ts:createLeadAction,sendLeadWhatsappAction,scheduleLeadActionAction,updateFollowUpActionAction,clearLeadActionAction,updateLeadConversationAction,deleteLeadAction',
    'lib/leads/repository.ts:createLead,updateLeadWhatsappStatus,markLeadAfterOutboundMessage,createFollowUpAction,updateFollowUpAction,clearLeadAction,softDeleteLead,markLeadCustomerReply,updateLeadConversationState,createLeadMessage,updateLeadMessage,updateLeadMessageByProviderId',
    'app/api/webhooks/evolution/route.ts:POST via processIncomingMessage/processOutboundEvent',
    'lib/config/actions.ts:saveSellerProfileOverrideAction',
    'lib/config/message-actions.ts:saveWhatsappMessageTemplateAction via lib/config/persistent-settings.ts:savePersistentSettings',
    'supabase/functions/send-whatsapp-welcome/index.ts:updateWhatsappStatus',
    'supabase/migrations/004_leadflow_follow_up_actions.sql:sync_lead_next_action_summary',
    'supabase/migrations/008_soft_delete_lead_rpc.sql:soft_delete_lead'
  ),
  'checks', coalesce(jsonb_agg(to_jsonb(c) order by c.check_id), '[]'::jsonb),
  'summary', jsonb_build_object(
    'fail_count', count(*) filter (where c.status = 'FAIL'),
    'pass_count', count(*) filter (where c.status = 'PASS'),
    'na_count', count(*) filter (where c.status = 'N/A'),
    'status', case when count(*) filter (where c.status = 'FAIL') = 0 then 'PASS' else 'FAIL' end
  )
) as e4_s4_dry_run_report
from _e4_s4_checks c;

rollback;
