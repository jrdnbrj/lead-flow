import type { CardQuote } from "../financial/card-quote";
import type { NovaCreditQuote } from "../financial/novacredit";
import type { CardQuoteSnapshot, NovaCreditQuoteSnapshot, QuoteSnapshot } from "./types";

const CARD_QUOTE_RULES_VERSION = "card-credit-v1" as const;

type SnapshotInput = {
  leadId: string;
  clientName: string;
  clientPhone: string;
  modelId: string;
  modelName: string;
  quote: CardQuote;
  documentDate?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerCompany?: string;
};

export function createCardQuoteSnapshot(input: SnapshotInput): CardQuoteSnapshot {
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
    ...(input.sellerName ? { sellerName: input.sellerName.trim() } : {}),
    ...(input.sellerPhone ? { sellerPhone: input.sellerPhone.trim() } : {}),
    ...(input.sellerEmail ? { sellerEmail: input.sellerEmail.trim() } : {}),
    ...(input.sellerCompany ? { sellerCompany: input.sellerCompany.trim() } : {}),
  };
}

type NovaCreditSnapshotInput = {
  leadId: string;
  clientName: string;
  clientPhone: string;
  modelId: string;
  modelName: string;
  quote: NovaCreditQuote;
  documentDate?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerCompany?: string;
};

export function createNovaCreditSnapshot(input: NovaCreditSnapshotInput): NovaCreditQuoteSnapshot {
  return {
    quoteType: "NOVACREDIT",
    leadId: input.leadId.trim(),
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone.trim(),
    modelId: input.modelId.trim(),
    modelName: input.modelName.trim(),
    vehicleAmount: input.quote.vehicleValue,
    accessories: input.quote.accessories,
    downPayment: input.quote.downPayment,
    termMonths: input.quote.term,
    deviceAmount: input.quote.device,
    totalVehicleValue: input.quote.totalVehicleValue,
    minimumDownPayment: input.quote.minimumDownPayment,
    downPaymentPercentage: input.quote.downPaymentPercentage,
    legalExpenses: input.quote.legalExpenses,
    vehicleInsurance: input.quote.vehicleInsurance,
    lifeInsurance: input.quote.lifeInsurance,
    financedWithoutLifeInsurance: input.quote.financedWithoutLifeInsurance,
    internalLifeCalculationBalance: input.quote.internalLifeCalculationBalance,
    financedValue: input.quote.financedValue,
    monthlyInstallment: input.quote.monthlyInstallment,
    finalInstallment: input.quote.finalInstallment,
    fixedFinancingChargeApplied: input.quote.fixedFinancingChargeApplied,
    rulesVersion: input.quote.rulesVersion,
    documentDate: input.documentDate ?? new Date().toISOString(),
    ...(input.sellerName ? { sellerName: input.sellerName.trim() } : {}),
    ...(input.sellerPhone ? { sellerPhone: input.sellerPhone.trim() } : {}),
    ...(input.sellerEmail ? { sellerEmail: input.sellerEmail.trim() } : {}),
    ...(input.sellerCompany ? { sellerCompany: input.sellerCompany.trim() } : {}),
  };
}

function snapshotIdentity(snapshot: QuoteSnapshot): Omit<QuoteSnapshot, "documentDate"> {
  // The generation date is printed for the customer's reference, but it is
  // not a form-controlled input. Excluding it prevents an otherwise identical
  // cotización from becoming stale merely because time passed. JSONB may also
  // return object keys in a different order than the client-created snapshot,
  // so canonicalize the remaining top-level fields before comparing them.
  const identity = Object.fromEntries(
    Object.entries(snapshot)
      .filter(([key]) => key !== "documentDate")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return identity as Omit<QuoteSnapshot, "documentDate">;
}

export function quoteSnapshotsEquivalent(left: QuoteSnapshot, right: QuoteSnapshot): boolean {
  return JSON.stringify(snapshotIdentity(left)) === JSON.stringify(snapshotIdentity(right));
}

export function snapshotToJson(snapshot: QuoteSnapshot): Record<string, unknown> {
  return { ...snapshot };
}
