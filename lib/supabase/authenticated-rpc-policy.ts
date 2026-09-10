/**
 * Recovery policy for server-side RPC calls made with the advisor session.
 *
 * SERVER_FALLBACK is only for functions whose SQL implementation verifies the
 * installation owner and whose service_role grant is forward-managed by a
 * migration. SESSION_REFRESH keeps the user JWT as the only authorization
 * path because the function is not approved for service-role execution.
 */
export const AUTHENTICATED_RPC_POLICIES = {
  correct_inbound_response_v1: "SERVER_FALLBACK",
  create_lead_follow_up_action_v1: "SERVER_FALLBACK",
  transition_lead_follow_up_action_v1: "SERVER_FALLBACK",
  record_purchase_decision_v1: "SERVER_FALLBACK",
  record_purchase_decision_v2: "SERVER_FALLBACK",
  revert_purchase_decision_v1: "SERVER_FALLBACK",
  request_first_contact_v1: "SERVER_FALLBACK",
  request_first_contact_v2: "SERVER_FALLBACK",
  claim_first_contact_effect_v1: "SERVER_FALLBACK",
  begin_first_contact_effect_io_v1: "SERVER_FALLBACK",
  record_first_contact_effect_result_v1: "SERVER_FALLBACK",
  retry_first_contact_effect_v1: "SERVER_FALLBACK",
  get_purchase_case_v1: "SERVER_FALLBACK",
  ensure_purchase_case_v1: "SERVER_FALLBACK",
  complete_purchase_milestone_v1: "SERVER_FALLBACK",
  revert_purchase_milestone_v1: "SERVER_FALLBACK",
  upsert_push_subscription_v1: "SESSION_REFRESH",
} as const;

export type AuthenticatedRpcName = keyof typeof AUTHENTICATED_RPC_POLICIES;
export type AuthenticatedRpcPolicy = typeof AUTHENTICATED_RPC_POLICIES[AuthenticatedRpcName];
