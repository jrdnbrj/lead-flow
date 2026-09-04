import type { CardQuote } from "../financial/card-quote";
import type { QuoteSnapshot } from "./types";

const CARD_QUOTE_RULES_VERSION = "card-credit-v1" as const;

type SnapshotInput = {
  leadId: string;
  clientName: string;
  clientPhone: string;
  modelId: string;
  modelName: string;
  quote: CardQuote;
  documentDate?: string;
};

export function createCardQuoteSnapshot(input: SnapshotInput): QuoteSnapshot {
  return {
    quoteType: "TARJETA_CREDITO",
    leadId: input.leadId.trim(),
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone.trim(),
    modelId: input.modelId.trim(),
    modelName: input.modelName.trim(),
    amount: input.quote.amount,
    modality: input.quote.modality,
    term: input.quote.term,
    factor: input.quote.factor,
    interest: input.quote.interest,
    total: input.quote.total,
    installment: input.quote.installment,
    rulesVersion: CARD_QUOTE_RULES_VERSION,
    documentDate: input.documentDate ?? new Date().toISOString(),
  };
}

function snapshotIdentity(snapshot: QuoteSnapshot): Omit<QuoteSnapshot, "documentDate"> {
  // The generation date is printed for the customer's reference, but it is
  // not a form-controlled input. Excluding it prevents an otherwise identical
  // cotización from becoming stale merely because time passed.
  return {
    quoteType: snapshot.quoteType,
    leadId: snapshot.leadId,
    clientName: snapshot.clientName,
    clientPhone: snapshot.clientPhone,
    modelId: snapshot.modelId,
    modelName: snapshot.modelName,
    amount: snapshot.amount,
    modality: snapshot.modality,
    term: snapshot.term,
    factor: snapshot.factor,
    interest: snapshot.interest,
    total: snapshot.total,
    installment: snapshot.installment,
    rulesVersion: snapshot.rulesVersion,
  };
}

export function quoteSnapshotsEquivalent(left: QuoteSnapshot, right: QuoteSnapshot): boolean {
  return JSON.stringify(snapshotIdentity(left)) === JSON.stringify(snapshotIdentity(right));
}

export function snapshotToJson(snapshot: QuoteSnapshot): Record<string, unknown> {
  return { ...snapshot };
}
