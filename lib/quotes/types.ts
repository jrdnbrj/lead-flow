import type { CardModality, CardQuote } from "@/lib/financial/card-quote";

export const CARD_QUOTE_RULES_VERSION = "card-credit-v1" as const;

export type QuoteType = "TARJETA_CREDITO";

export type QuoteSnapshot = {
  quoteType: QuoteType;
  leadId: string;
  clientName: string;
  clientPhone: string;
  modelId: string;
  modelName: string;
  amount: number;
  modality: CardModality;
  term: number;
  factor: number;
  interest: number;
  total: number;
  installment: number;
  rulesVersion: typeof CARD_QUOTE_RULES_VERSION;
  documentDate: string;
};

export type QuoteLeadOption = {
  id: string;
  fullName: string;
  phone: string;
  models: Array<{ id: string; name: string }>;
};

export type QuoteFileSummary = {
  id: string;
  fileName: string;
  quoteType: QuoteType;
  modelName: string;
  amount: number;
  modality: CardModality;
  term: number;
  generatedAt: string;
};

export type GeneratedQuoteFile = QuoteFileSummary & {
  snapshot: QuoteSnapshot;
};

export type CardQuotePdfInput = {
  leadId: string;
  modelId: string;
  amount: string;
  modality: string;
  term: number | null;
};

export type QuoteDocumentData = {
  snapshot: QuoteSnapshot;
  quote: CardQuote;
};
