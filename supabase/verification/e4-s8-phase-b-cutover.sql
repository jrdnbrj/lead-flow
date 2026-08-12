-- E4-S8 preparation script. DO NOT run against an unapproved target.
-- Runtime executor must bind an isolated preview target and an explicit
-- correlation_id, keep this transaction open, and rollback on any assertion.
begin;
select pg_advisory_xact_lock(hashtextextended('leadflow_auth_cutover', 0));

-- Preconditions are deliberately read-only until the executor has validated
-- E4-S1/E4-S4/E4-S7 evidence and maintenance state.
select count(*) as null_lead_owners from public.leads where user_id is null;
select count(*) as null_settings_owners from public.leadflow_settings where user_id is null;

-- The following mutation section is gated by the external runtime executor;
-- it is not executed by implementation validation.
-- UPDATE public.leads SET user_id = :advisor_user_id WHERE user_id IS NULL;
-- UPDATE public.leadflow_settings SET user_id = :advisor_user_id WHERE user_id IS NULL;
-- Apply only the frozen E4-S7 target policy/grant diff here.
-- Assert zero NULL/orphan/mismatch, record counts and event references, then
-- COMMIT only after every assertion; otherwise ROLLBACK and keep maintenance.
rollback;
