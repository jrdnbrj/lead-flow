-- E5 production hardening. Forward-only; does not change E1 action semantics.
begin;

create extension if not exists pg_cron with schema extensions;

revoke all on function public.upsert_push_subscription_v1(text, text, text) from public, anon;
revoke all on function public.invalidate_push_subscription_v1(uuid) from public, anon;
grant execute on function public.upsert_push_subscription_v1(text, text, text) to authenticated;
grant execute on function public.invalidate_push_subscription_v1(uuid) to authenticated;

revoke all on public.push_subscriptions, public.push_deliveries from public, anon, authenticated;
grant select on public.push_deliveries to authenticated;

comment on function public.upsert_push_subscription_v1(text, text, text) is 'Authenticated advisor subscription upsert; anonymous execution is forbidden.';
comment on function public.invalidate_push_subscription_v1(uuid) is 'Authenticated advisor subscription invalidation; anonymous execution is forbidden.';
comment on table public.push_deliveries is 'Web Push delivery projection; authenticated reads are owner-filtered by RLS and writes are server-only.';

commit;
