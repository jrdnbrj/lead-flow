export const PUSH_EVENT_TYPES = [
  "push_delivery_scheduled",
  "push_generated",
  "push_service_result",
  "push_subscription_activated",
  "push_subscription_deactivated",
  "push_subscription_invalid",
  "push_action_taken",
  "push_action_rejected",
  "push_duplicate_suppressed",
] as const;

export type PushEventType = (typeof PUSH_EVENT_TYPES)[number];

export function isPushEventType(value: string): value is PushEventType {
  return (PUSH_EVENT_TYPES as readonly string[]).includes(value);
}
