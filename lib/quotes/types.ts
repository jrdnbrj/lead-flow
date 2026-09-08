import type { CardModality, CardQuote } from "@/lib/financial/card-quote";
import type { NovaCreditQuote, NovaCreditTerm } from "@/lib/financial/novacredit";

export const CARD_QUOTE_RULES_VERSION = "card-credit-v1" as const;

export type QuoteType = "TARJETA_CREDITO" | "NOVACREDIT";

type QuoteSnapshotContext = {
  leadId: string;
  clientName: string;
  clientPhone: string;
  modelId: string;
  modelName: string;
  documentDate: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerCompany?: string;
};

export type CardQuoteSnapshot = QuoteSnapshotContext & {
  quoteType: "TARJETA_CREDITO";
  amount: number;
  modality: CardModality;
  term: number;
  factor: number;
  interest: number;
  total: number;
  installment: number;
  rulesVersion: typeof CARD_QUOTE_RULES_VERSION;
};

export type NovaCreditQuoteSnapshot = QuoteSnapshotContext & {
  quoteType: "NOVACREDIT";
  vehicleAmount: number;
  accessories: number;
  downPayment: number;
  termMonths: NovaCreditTerm;
  deviceAmount: number;
  totalVehicleValue: number;
  minimumDownPayment: number;
  downPaymentPercentage: number;
  legalExpenses: number;
  vehicleInsurance: number;
  lifeInsurance: number;
  financedWithoutLifeInsurance: number;
  internalLifeCalculationBalance: number;
  financedValue: number;
  monthlyInstallment: number;
  finalInstallment: number;
  fixedFinancingChargeApplied: number;
  rulesVersion: NovaCreditQuote["rulesVersion"];
};

export type QuoteSnapshot = CardQuoteSnapshot | NovaCreditQuoteSnapshot;

export type QuoteLeadOption = {
  id: string;
  fullName: string;
  phone: string;
  models: Array<{ id: string; name: string }>;
};

export type QuoteCatalogModel = { id: string; name: string };

type QuoteFileSummaryBase = {
  id: string;
  fileName: string;
  quoteType: QuoteType;
  modelName: string;
  amount: number;
  term: number;
  installment: number;
  generatedAt: string;
  sendStatus: QuoteFileSendStatus | null;
  sentAt: string | null;
};

export type CardQuoteFileSummary = QuoteFileSummaryBase & { quoteType: "TARJETA_CREDITO"; modality: CardModality };
export type NovaCreditQuoteFileSummary = QuoteFileSummaryBase & { quoteType: "NOVACREDIT" };
export type QuoteFileSummary = CardQuoteFileSummary | NovaCreditQuoteFileSummary;

export type GeneratedCardQuoteFile = CardQuoteFileSummary & { snapshot: CardQuoteSnapshot };
export type GeneratedNovaCreditQuoteFile = NovaCreditQuoteFileSummary & { snapshot: NovaCreditQuoteSnapshot };
export type GeneratedQuoteFile = GeneratedCardQuoteFile | GeneratedNovaCreditQuoteFile;

export type CardQuotePdfInput = {
  leadId: string;
  modelId: string;
  amount: string;
  modality: string;
  term: number | null;
};

export type NovaCreditQuotePdfInput = {
  leadId: string;
  modelId: string;
  vehicleValue: string;
  accessories: string;
  downPayment: string;
  term: number | null;
  device: string;
};

export type QuoteDocumentData = {
  snapshot: QuoteSnapshot;
  quote: CardQuote | NovaCreditQuote;
};

export type QuoteFileSendStatus = "CLAIMED" | "ACCEPTED" | "FAILED" | "UNKNOWN";

export type QuoteFileSendClaim = {
  sendId: string;
  attemptNo: number;
  status: QuoteFileSendStatus;
  claimAction: "CLAIMED" | "CLAIMED_RETRY" | "REPLAYED" | "BLOCKED_UNKNOWN" | "IN_PROGRESS";
  providerMessageId: string | null;
};

export type QuoteSendActionData = {
  status: QuoteFileSendStatus;
  quoteFile: GeneratedQuoteFile;
  providerMessageId: string | null;
  replayed: boolean;
};

export type PreparedQuoteForSend = {
  quoteFile: GeneratedQuoteFile;
  clientName: string;
  clientPhone: string;
  modelName: string;
};
