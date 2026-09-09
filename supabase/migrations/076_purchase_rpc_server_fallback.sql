-- JWT clock-skew recovery for the purchase decision actions.
--
-- The Server Action has already passed requireAdvisor(). These RPCs still
-- resolve the installation owner and verify the active, owned lead in SQL.
-- The service_role grant only enables the existing server-side fallback when
-- PostgREST rejects the browser session token with PGRST303; it is never
-- exposed to the browser and does not bypass the RPC ownership checks.

grant execute on function public.record_purchase_decision_v1(uuid, text, timestamptz)
  to service_role;
grant execute on function public.record_purchase_decision_v2(uuid, text, text, timestamptz)
  to service_role;
grant execute on function public.revert_purchase_decision_v1(uuid, text)
  to service_role;
