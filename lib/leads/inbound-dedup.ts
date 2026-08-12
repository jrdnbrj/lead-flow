export type InboundIdentity = { evolutionInstance: string; providerMessageId: string };
export type InboundOrderInput = InboundIdentity & { timestamp: string };
export type InboundDedupResult = { accepted: true; replay: false } | { accepted: false; replay: true } | { accepted: false; replay: false; reason: "INVALID_IDENTITY" };

export class InboundMessageLedger {
  private readonly identities = new Set<string>();

  accept(input: InboundIdentity): InboundDedupResult {
    if (!input.evolutionInstance.trim() || !input.providerMessageId.trim()) return { accepted: false, replay: false, reason: "INVALID_IDENTITY" };
    const identity = `${input.evolutionInstance}\u0000${input.providerMessageId}`;
    if (this.identities.has(identity)) return { accepted: false, replay: true };
    this.identities.add(identity);
    return { accepted: true, replay: false };
  }
}

export function compareInboundOrder(a: InboundOrderInput, b: InboundOrderInput): number {
  return a.timestamp.localeCompare(b.timestamp) || a.evolutionInstance.localeCompare(b.evolutionInstance) || a.providerMessageId.localeCompare(b.providerMessageId);
}
