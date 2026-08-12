export type PushDeliveryStatus = "SCHEDULED" | "CLAIMED" | "GENERATED" | "ACCEPTED" | "FAILED" | "UNKNOWN" | "CANCELED";
export type PushProviderResult = "ACCEPTED" | "FAILED" | "UNKNOWN";
export type PushCommand = "DONE" | "IGNORE" | "POSTPONE_PLUS_ONE_HOUR" | "POSTPONE_LATER" | "POSTPONE_TOMORROW" | "POSTPONE_IN_THREE_DAYS";

export type PushDeliveryIdentity = {
  actionId: string;
  actionVersion: number;
  subscriptionId: string;
  subscriptionGeneration: number;
};

export type PushSubscription = {
  id: string;
  subscriptionGeneration: number;
  active: boolean;
};

export type PushEffect = { id: string; kind: "WEB_PUSH" };
export type PushCapability = { id: string; deliveryId: string; command: PushCommand; actionVersion: number; expiresAt: string; consumedAt?: string | null };

export type PushDelivery = {
  id: string;
  identity: PushDeliveryIdentity;
  status: PushDeliveryStatus;
  effectId: string;
  scheduledFor: string;
  sourceMessageId?: string | null;
};

export type PushProviderOutcome = {
  result: PushProviderResult;
  providerStatus?: string | null;
};
