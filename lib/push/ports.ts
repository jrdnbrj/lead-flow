import type { PushDelivery, PushDeliveryIdentity, PushProviderOutcome, PushSubscription } from "@/lib/push/types";

export interface PushSubscriptionStore {
  findActiveForOwner(ownerId: string): Promise<PushSubscription[]>;
}

export interface PushDeliveryStore {
  findOrCreate(identity: PushDeliveryIdentity, scheduledFor: string, effectId: string): Promise<{ delivery: PushDelivery; replayed: boolean }>;
  claim(deliveryId: string): Promise<PushDelivery | null>;
  beginIo(deliveryId: string): Promise<PushDelivery | null>;
  recordResult(deliveryId: string, outcome: PushProviderOutcome): Promise<PushDelivery | null>;
  cancel(deliveryId: string): Promise<PushDelivery | null>;
}

export interface PushScheduler {
  findDueDeliveries(now: string): Promise<PushDelivery[]>;
}

export interface PushProvider {
  send(delivery: PushDelivery): Promise<PushProviderOutcome>;
}

export interface PushCapabilityConsumer {
  consume(deliveryId: string, command: string): Promise<{ status: string }>;
}

export interface PushDispatcher {
  dispatchDue(now: string): Promise<PushDelivery[]>;
}
