-- Allow the already-authorized LeadFlow server action to complete follow-up
-- commands when Supabase rejects a freshly issued browser JWT as future.
-- The RPCs still resolve the installation owner and verify lead ownership.

begin;

grant execute on function public.create_lead_follow_up_action_v1(
  uuid,
  public.next_action_type,
  timestamptz,
  text,
  text,
  uuid,
  bigint
) to service_role;

grant execute on function public.transition_lead_follow_up_action_v1(
  uuid,
  public.follow_up_action_status,
  bigint,
  timestamptz,
  text,
  text,
  text
) to service_role;

commit;
