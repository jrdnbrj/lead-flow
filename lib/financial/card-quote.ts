export const cardModalities = [
  { value: "NORMAL", label: "Normal" },
  { value: "CORPORATIVO", label: "Corporativo" },
] as const;

export type CardModality = (typeof cardModalities)[number]["value"];

export const cardFactorTable: Record<CardModality, Record<number, number>> = {
  NORMAL: {
    3: 0.0268,
    6: 0.0473,
    9: 0.0681,
    12: 0.0891,
    15: 0.1103,
    18: 0.1319,
    24: 0.1758,
    36: 0.2667,
    48: 0.3618,
    60: 0.4610,
  },
  CORPORATIVO: {
    3: 0.0187,
    6: 0.0330,
    9: 0.0473,
    12: 0.0618,
    15: 0.0764,
    18: 0.0912,
    24: 0.1211,
    36: 0.1825,
  },
};

export type CardQuoteDraft = {
  modality: string;
  term: number | null;
  amount: number | null;
};

export type CardQuoteInput = {
  modality: CardModality;
  term: number;
  amount: number;
};

export type CardQuote = CardQuoteInput & {
  factor: number;
  interest: number;
  total: number;
  installment: number;
};

export type CardQuoteValidationError = "INVALID_MODALITY" | "AMOUNT_REQUIRED" | "AMOUNT_INVALID" | "TERM_REQUIRED" | "UNSUPPORTED_TERM";

export type CardQuoteValidation =
  | { valid: true; input: CardQuoteInput; factor: number }
  | { valid: false; code: CardQuoteValidationError; message: string };

export function isCardModality(value: string): value is CardModality {
  return value === "NORMAL" || value === "CORPORATIVO";
}

export function getCardTerms(modality: string): number[] {
  return isCardModality(modality) ? Object.keys(cardFactorTable[modality]).map(Number) : [];
}

export function getCardFactor(modality: string, term: number): number | null {
  if (!isCardModality(modality)) return null;
  return cardFactorTable[modality][term] ?? null;
}

export function validateCardQuote(input: CardQuoteDraft): CardQuoteValidation {
  if (!isCardModality(input.modality)) return { valid: false, code: "INVALID_MODALITY", message: "Selecciona una modalidad válida." };
  if (input.amount === null) return { valid: false, code: "AMOUNT_REQUIRED", message: "Ingresa el monto a financiar." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { valid: false, code: "AMOUNT_INVALID", message: "El monto debe ser mayor que cero." };
  if (input.term === null || !Number.isInteger(input.term)) return { valid: false, code: "TERM_REQUIRED", message: "Selecciona un plazo." };

  const factor = getCardFactor(input.modality, input.term);
  if (factor === null) return { valid: false, code: "UNSUPPORTED_TERM", message: `El plazo de ${input.term} meses no aplica para modalidad ${input.modality === "NORMAL" ? "Normal" : "Corporativo"}.` };

  return { valid: true, input: { modality: input.modality, term: input.term, amount: input.amount }, factor };
}

export function calculateCardQuote(input: CardQuoteDraft): CardQuote | null {
  const validation = validateCardQuote(input);
  if (!validation.valid) return null;

  const { amount, term, modality } = validation.input;
  const interest = validation.factor * amount;
  const total = amount + interest;
  return { modality, term, amount, factor: validation.factor, interest, total, installment: total / term };
}

export function parseCardAmount(value: string): number | null {
  const cleaned = value.trim().replace(/[^\d,.-]/gu, "");
  if (!cleaned) return null;

  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  const normalized = commaIndex > dotIndex
    ? cleaned.replace(/\./gu, "").replace(",", ".")
    : commaIndex >= 0
      ? cleaned.replace(/,/gu, ".")
      : cleaned;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function formatCardCurrency(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatCardFactor(value: number): string {
  return value.toFixed(4);
}
