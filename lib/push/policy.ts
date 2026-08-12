import type { PushDelivery, PushDeliveryIdentity, PushDeliveryStatus, PushProviderOutcome } from "@/lib/push/types";

export function pushDeliveryIdentityKey(identity: PushDeliveryIdentity): string {
  return [identity.actionId, identity.actionVersion, identity.subscriptionId, identity.subscriptionGeneration].join(":");
}

export function samePushDeliveryIdentity(left: PushDeliveryIdentity, right: PushDeliveryIdentity): boolean {
  return pushDeliveryIdentityKey(left) === pushDeliveryIdentityKey(right);
}

export function canClaimPushDelivery(status: PushDeliveryStatus): boolean { return status === "SCHEDULED"; }
export function canBeginPushIo(status: PushDeliveryStatus): boolean { return status === "CLAIMED"; }
export function canRecordPushResult(status: PushDeliveryStatus): boolean { return status === "GENERATED"; }
export function canCancelPushDelivery(status: PushDeliveryStatus): boolean { return status === "SCHEDULED" || status === "CLAIMED"; }
export function canAutomaticallyResend(status: PushDeliveryStatus): boolean { void status; return false; }

export function applyPushProviderOutcome(delivery: PushDelivery, outcome: PushProviderOutcome): PushDelivery {
  if (!canRecordPushResult(delivery.status)) return delivery;
  return { ...delivery, status: outcome.result };
}

export function cancelBeforePushIo(delivery: PushDelivery): PushDelivery {
  return canCancelPushDelivery(delivery.status) ? { ...delivery, status: "CANCELED" } : delivery;
}
