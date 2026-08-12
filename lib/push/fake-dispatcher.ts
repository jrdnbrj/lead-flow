import { applyPushProviderOutcome, canBeginPushIo, canClaimPushDelivery, canRecordPushResult, cancelBeforePushIo, pushDeliveryIdentityKey } from "@/lib/push/policy";
import type { PushDelivery, PushDeliveryIdentity, PushProviderOutcome } from "@/lib/push/types";

export type FakeDispatchResult = { delivery: PushDelivery; replayed: boolean; ioStarted: boolean };

export class FakePushDispatcher {
  private readonly deliveries = new Map<string, PushDelivery>();
  private readonly outcomes: PushProviderOutcome[];
  private calls = 0;

  constructor(outcomes: PushProviderOutcome[] = [{ result: "ACCEPTED", providerStatus: "FAKE_ACCEPTED" }]) { this.outcomes = outcomes; }

  get providerCalls(): number { return this.calls; }

  materialize(identity: PushDeliveryIdentity, scheduledFor: string, effectId: string): { delivery: PushDelivery; replayed: boolean } {
    const key = pushDeliveryIdentityKey(identity);
    const existing = this.deliveries.get(key);
    if (existing) return { delivery: existing, replayed: true };
    const delivery: PushDelivery = { id: `fake-delivery-${this.deliveries.size + 1}`, identity, effectId, scheduledFor, status: "SCHEDULED" };
    this.deliveries.set(key, delivery);
    return { delivery, replayed: false };
  }

  dispatch(identity: PushDeliveryIdentity, scheduledFor: string, effectId: string, currentActionVersion = identity.actionVersion, currentSubscriptionGeneration = identity.subscriptionGeneration): FakeDispatchResult {
    const materialized = this.materialize(identity, scheduledFor, effectId);
    let delivery = materialized.delivery;
    if (delivery.identity.actionVersion !== currentActionVersion || delivery.identity.subscriptionGeneration !== currentSubscriptionGeneration) {
      delivery = cancelBeforePushIo(delivery);
      this.deliveries.set(pushDeliveryIdentityKey(identity), delivery);
      return { delivery, replayed: materialized.replayed, ioStarted: false };
    }
    if (!canClaimPushDelivery(delivery.status)) return { delivery, replayed: materialized.replayed, ioStarted: false };
    delivery = { ...delivery, status: "CLAIMED" };
    if (!canBeginPushIo(delivery.status)) return { delivery, replayed: materialized.replayed, ioStarted: false };
    delivery = { ...delivery, status: "GENERATED" };
    if (!canRecordPushResult(delivery.status)) return { delivery, replayed: materialized.replayed, ioStarted: false };
    this.calls += 1;
    const outcome = this.outcomes[Math.min(this.calls - 1, this.outcomes.length - 1)] ?? { result: "UNKNOWN" as const, providerStatus: "FAKE_UNKNOWN" };
    delivery = applyPushProviderOutcome(delivery, outcome);
    this.deliveries.set(pushDeliveryIdentityKey(identity), delivery);
    return { delivery, replayed: materialized.replayed, ioStarted: true };
  }
}
