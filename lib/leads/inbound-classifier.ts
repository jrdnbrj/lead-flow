export type InboundClassification = "NO_SUGGESTION" | "PENDING" | "REVIEW";

export type InboundClassificationResult = {
  classification: InboundClassification;
  reasonCode: "EXACT_ALLOWLIST" | "ALLOWED_EMOJI" | "QUESTION_OR_COMMERCIAL_SIGNAL" | "AMBIGUOUS";
};

const NO_SUGGESTION_ALLOWLIST = new Set([
  "gracias", "muchas gracias", "mil gracias", "te agradezco", "muy amable", "ok", "okay", "vale", "listo", "perfecto", "de acuerdo", "entendido", "recibido", "confirmado", "correcto", "exacto", "sí", "si", "así es", "tal cual", "quedamos así", "nos vemos",
]);

const ALLOWED_EMOJIS = new Set(["👍", "👌", "🙏", "✅", "🙂", "😊", "😉", "💯"]);
const QUESTION_WORDS = /^(qué|cual|cuál|cómo|cuándo|dónde|cuánto|cuántos|quién)\b/u;
const COMMERCIAL_WORDS = /\b(quiero|necesito|me interesa|busco|cotizar|cotización|precio|valor|disponible|disponibilidad|cuota|financiar|financiación|agendar|separar|comprar|probar|envíame|mándame|compárteme|puedes|puede|podrías|podría|tienen|tiene)\b/u;

export function normalizeInboundText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("es")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/^[^\p{L}\p{N}\p{Extended_Pictographic}¿?]+|[^\p{L}\p{N}\p{Extended_Pictographic}¿?]+$/gu, "")
    .replace(/\s+/gu, " ");
}

function isAllowedEmojiOnly(value: string): boolean {
  const emojiText = value.replace(/[\uFE0E\uFE0F\u{1F3FB}-\u{1F3FF}\s]/gu, "");
  if (!emojiText) return false;
  return Array.from(emojiText).every((emoji) => ALLOWED_EMOJIS.has(emoji));
}

export function classifyInboundMessage(value: string): InboundClassificationResult {
  const normalized = normalizeInboundText(value);
  if (NO_SUGGESTION_ALLOWLIST.has(normalized)) return { classification: "NO_SUGGESTION", reasonCode: "EXACT_ALLOWLIST" };
  if (isAllowedEmojiOnly(normalized)) return { classification: "NO_SUGGESTION", reasonCode: "ALLOWED_EMOJI" };
  if (normalized.includes("¿") || normalized.includes("?") || QUESTION_WORDS.test(normalized) || COMMERCIAL_WORDS.test(normalized)) {
    return { classification: "PENDING", reasonCode: "QUESTION_OR_COMMERCIAL_SIGNAL" };
  }
  return { classification: "REVIEW", reasonCode: "AMBIGUOUS" };
}
