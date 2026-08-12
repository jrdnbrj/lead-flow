-- E4-S7: read-only preparation checks. No REVOKE/GRANT/ALTER/UPDATE/INSERT/DELETE.
select 'TABLE' as check_kind, c.relname as object_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policy_count
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
  and c.relname in ('leads','lead_messages','lead_follow_up_actions','leadflow_settings','leadflow_events','car_models','car_model_images')
order by c.relname;

select 'POLICY' as check_kind, schemaname, tablename, policyname, roles::text, cmd
from pg_policies
where schemaname='public'
  and tablename in ('leads','lead_messages','lead_follow_up_actions','leadflow_settings','leadflow_events','car_models','car_model_images')
order by tablename, policyname;

select 'FUNCTION' as check_kind, n.nspname as schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('anon', p.oid, 'execute') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('soft_delete_lead','append_leadflow_event_v1')
order by p.proname;

select 'PUBLICATION' as check_kind, pubname, count(*) as membership_count
from pg_publication_tables
where schemaname='public'
group by pubname order by pubname;
