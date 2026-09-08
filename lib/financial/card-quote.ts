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
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !hasSafeMoneyPrecision(input.amount)) {
    return { valid: false, code: "AMOUNT_INVALID", message: "Ingresa un monto en dólares mayor que cero, con hasta 2 decimales." };
  }
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

const MAX_SAFE_AMOUNT_CENTS = Number.MAX_SAFE_INTEGER - 100;

type CardAmountParts = { integerDigits: string; fractionDigits: string; hasDecimalSeparator: boolean };

function isValidGroupedInteger(value: string): boolean {
  if (/^\d+$/u.test(value)) return true;
  const groups = value.split(/[,.]/u);
  return groups.length > 1 && /^[1-9]\d{0,2}$/u.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/u.test(group));
}

function splitCardAmount(value: string): CardAmountParts | null {
  const trimmed = value.trim();
  if (!trimmed || /[^\d,.$\s]/u.test(trimmed)) return null;

  const cleaned = trimmed.replace(/[\s$]/gu, "");
  if (!cleaned || !/\d/u.test(cleaned)) return null;

  const separators = cleaned.match(/[,.]/gu) ?? [];
  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  let decimalIndex = -1;

  if (commaIndex >= 0 && dotIndex >= 0) {
    decimalIndex = Math.max(commaIndex, dotIndex);
  } else if (separators.length > 1 && isValidGroupedInteger(cleaned)) {
    decimalIndex = -1;
  } else if (commaIndex >= 0 || dotIndex >= 0) {
    const separatorIndex = Math.max(commaIndex, dotIndex);
    const left = cleaned.slice(0, separatorIndex);
    const right = cleaned.slice(separatorIndex + 1);
    const leftDigits = left.replace(/\D/gu, "");

    // In Ecuador, a single separator followed by three digits is normally a
    // thousands group. A zero-only integer such as 0,001 is kept as a
    // decimal so it is rejected for exceeding the two-cent precision limit,
    // instead of being silently changed into 1.
    if (right.length === 3 && leftDigits.length > 0 && leftDigits !== "0" && leftDigits.length <= 3 && isValidGroupedInteger(cleaned)) {
      decimalIndex = -1;
    } else {
      decimalIndex = separatorIndex;
    }
  }

  const integerPart = decimalIndex >= 0 ? cleaned.slice(0, decimalIndex) : cleaned;
  const fractionPart = decimalIndex >= 0 ? cleaned.slice(decimalIndex + 1) : "";
  if (!isValidGroupedInteger(integerPart || "0") || /[,.]/u.test(fractionPart)) return null;

  const integerDigits = integerPart.replace(/\D/gu, "").replace(/^0+(?=\d)/u, "");
  const fractionDigits = fractionPart.replace(/\D/gu, "");
  return { integerDigits: integerDigits || "0", fractionDigits, hasDecimalSeparator: decimalIndex >= 0 };
}

export function formatCardAmountInput(value: string): string {
  const typingGroupedInteger = value.trim().replace(/[\s$]/gu, "");
  // Once the field has rendered 2.000, the next keypress can arrive as
  // 2.0000. Treat a trailing, incomplete thousands group as continued integer
  // typing so the input naturally becomes 20.000 instead of 2,0000.
  if (/^\d{1,3}(?:\.\d{3})+\d+$/u.test(typingGroupedInteger) && !typingGroupedInteger.includes(",")) {
    const integerDigits = typingGroupedInteger.replace(/\./gu, "").replace(/^0+(?=\d)/u, "") || "0";
    return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  const parts = splitCardAmount(value);
  if (!parts) return "";
  const groupedInteger = parts.integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${groupedInteger}${parts.hasDecimalSeparator ? `,${parts.fractionDigits}` : ""}`;
}

export function parseCardAmount(value: string): number | null {
  const parts = splitCardAmount(value);
  if (!parts) return null;
  if (parts.fractionDigits.length > 2) return null;

  const cents = Number(`${parts.integerDigits}${parts.fractionDigits.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(cents) || cents > MAX_SAFE_AMOUNT_CENTS) return null;
  return cents / 100;
}

function hasSafeMoneyPrecision(amount: number): boolean {
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents > MAX_SAFE_AMOUNT_CENTS) return false;
  const roundedAmount = cents / 100;
  return Math.abs(amount - roundedAmount) <= Number.EPSILON * Math.max(1, Math.abs(amount)) * 4;
}

export function formatCardCurrency(value: number): string {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function formatCardFactor(value: number): string {
  return value.toFixed(4);
}

export function formatCardFactorPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
