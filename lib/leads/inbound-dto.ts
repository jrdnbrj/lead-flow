import { formatPhoneForWhatsapp } from "@/lib/domain/lead";
import { extractEvolutionMessageId } from "@/lib/whatsapp/service";

export type InboundEventName = "MESSAGES_UPSERT" | "MESSAGES_SET";
export type InboundMessageDto = {
  providerMessageId: string;
  evolutionInstance: string;
  phone: string;
  remoteJid: string;
  timestamp: string;
  direction: "INBOUND";
  body: string | null;
  event: InboundEventName;
};

export type InboundDtoRejection = "UNSUPPORTED_EVENT" | "MISSING_PROVIDER_MESSAGE_ID" | "UNRESOLVABLE_PHONE" | "NOT_INBOUND" | "MISSING_INSTANCE";

export type InboundDtoResult = { accepted: true; dto: InboundMessageDto } | { accepted: false; reason: InboundDtoRejection };
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null { return typeof value === "object" && value !== null ? value as JsonRecord : null; }
function asString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

function getRemoteJid(item: JsonRecord): string | null {
  const key = asRecord(item.key);
  const data = asRecord(item.data);
  const dataKey = asRecord(data?.key);
  const remoteJid = asString(key?.remoteJid) ?? asString(dataKey?.remoteJid) ?? asString(item.remoteJid);
  const remoteJidAlt = asString(key?.remoteJidAlt) ?? asString(dataKey?.remoteJidAlt) ?? asString(item.remoteJidAlt);
  return remoteJid?.endsWith("@lid") ? remoteJidAlt ?? remoteJid : remoteJid ?? remoteJidAlt;
}

function phoneFromJid(jid: string): string | null {
  if (jid.includes("@g.us") || jid.includes("@broadcast")) return null;
  const digits = (jid.split("@")[0]?.split(":")[0] ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const phone = formatPhoneForWhatsapp(digits);
  return phone.length >= 7 ? phone : null;
}

function getBody(item: JsonRecord): string | null {
  const message = asRecord(item.message) ?? asRecord(asRecord(item.data)?.message) ?? {};
  const extended = asRecord(message.extendedTextMessage);
  const image = asRecord(message.imageMessage);
  const video = asRecord(message.videoMessage);
  const document = asRecord(message.documentMessage);
  return (asString(message.conversation) ?? asString(extended?.text) ?? asString(image?.caption) ?? asString(video?.caption) ?? asString(document?.caption) ?? asString(item.text) ?? asString(item.body))?.slice(0, 5000) ?? null;
}

function getTimestamp(item: JsonRecord): string {
  const raw = item.messageTimestamp ?? asRecord(item.data)?.messageTimestamp;
  const numeric = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  if (Number.isFinite(numeric)) {
    const date = new Date((numeric > 10_000_000_000 ? numeric : numeric * 1000));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}

export function normalizeInboundPayload(item: unknown, event: string, configuredInstance: string): InboundDtoResult {
  const record = asRecord(item);
  const normalizedEvent = event.toUpperCase().replace(/[.\s-]+/g, "_");
  if (!record || !["MESSAGES_UPSERT", "MESSAGES_SET"].includes(normalizedEvent)) return { accepted: false, reason: "UNSUPPORTED_EVENT" };
  const key = asRecord(record.key);
  const dataKey = asRecord(asRecord(record.data)?.key);
  if (key?.fromMe === true || dataKey?.fromMe === true || record.fromMe === true) return { accepted: false, reason: "NOT_INBOUND" };
  const providerMessageId = extractEvolutionMessageId(record);
  if (!providerMessageId) return { accepted: false, reason: "MISSING_PROVIDER_MESSAGE_ID" };
  const remoteJid = getRemoteJid(record);
  const phone = remoteJid ? phoneFromJid(remoteJid) : null;
  if (!remoteJid || !phone) return { accepted: false, reason: "UNRESOLVABLE_PHONE" };
  const evolutionInstance = asString(record.instance) ?? asString(asRecord(record.data)?.instance) ?? configuredInstance.trim();
  if (!evolutionInstance) return { accepted: false, reason: "MISSING_INSTANCE" };
  return { accepted: true, dto: { providerMessageId, evolutionInstance, phone, remoteJid, timestamp: getTimestamp(record), direction: "INBOUND", body: getBody(record), event: normalizedEvent as InboundEventName } };
}
