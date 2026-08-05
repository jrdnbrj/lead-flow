import { NextResponse } from "next/server";

import type { WhatsappStatus } from "@/lib/domain/lead";
import { formatPhoneForWhatsapp } from "@/lib/domain/lead";
import { findLeadByPhone, createLeadMessage, findLeadMessageByProviderId, markLeadCustomerReply, updateLeadMessage, updateLeadWhatsappStatus } from "@/lib/leads/repository";
import { extractEvolutionMessageId, normalizeEvolutionStatus } from "@/lib/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEvent(value: unknown): string {
  return asString(value)?.toUpperCase().replace(/[.\s-]+/g, "_") ?? "";
}

function flattenEventData(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap((item) => flattenEventData(item));
  const record = asRecord(value);
  if (!record) return [];
  if (Array.isArray(record.messages)) return record.messages.flatMap((item) => flattenEventData(item));
  return [record];
}

function getRemoteJid(item: JsonRecord): string | null {
  const key = asRecord(item.key);
  const data = asRecord(item.data);
  const dataKey = asRecord(data?.key);
  const remoteJid = asString(key?.remoteJid) ?? asString(dataKey?.remoteJid) ?? asString(item.remoteJid);
  const remoteJidAlt = asString(key?.remoteJidAlt) ?? asString(dataKey?.remoteJidAlt) ?? asString(item.remoteJidAlt);
  return remoteJid?.endsWith("@lid") ? remoteJidAlt ?? remoteJid : remoteJid ?? remoteJidAlt;
}

function phoneFromJid(jid: string | null): string | null {
  if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) return null;
  const localPart = jid.split("@")[0]?.split(":")[0] ?? "";
  const digits = localPart.replace(/\D/g, "");
  return digits.length >= 7 ? formatPhoneForWhatsapp(digits) : null;
}

function getMessage(item: JsonRecord): JsonRecord {
  return asRecord(item.message) ?? asRecord(asRecord(item.data)?.message) ?? {};
}

function extractMessageBody(item: JsonRecord): string | null {
  const message = getMessage(item);
  const extendedText = asRecord(message.extendedTextMessage);
  const image = asRecord(message.imageMessage);
  const video = asRecord(message.videoMessage);
  const document = asRecord(message.documentMessage);
  const button = asRecord(message.buttonsResponseMessage);
  const list = asRecord(message.listResponseMessage);
  const template = asRecord(message.templateButtonReplyMessage);
  const contact = asRecord(message.contactMessage);
  const body = asString(message.conversation)
    ?? asString(extendedText?.text)
    ?? asString(image?.caption)
    ?? asString(video?.caption)
    ?? asString(document?.caption)
    ?? asString(button?.selectedDisplayText)
    ?? asString(list?.title)
    ?? asString(template?.selectedDisplayText)
    ?? asString(contact?.displayName)
    ?? asString(item.text)
    ?? asString(item.body);
  return body?.slice(0, 5000) ?? null;
}

function getMessageTimestamp(item: JsonRecord): string {
  const raw = item.messageTimestamp ?? asRecord(item.data)?.messageTimestamp;
  const numeric = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function isFromMe(item: JsonRecord): boolean {
  const key = asRecord(item.key);
  const dataKey = asRecord(asRecord(item.data)?.key);
  return key?.fromMe === true || dataKey?.fromMe === true || item.fromMe === true;
}

function getStatusValue(item: JsonRecord): unknown {
  const update = asRecord(item.update);
  const data = asRecord(item.data);
  const dataUpdate = asRecord(data?.update);
  const updateItems = [
    ...(Array.isArray(item.update) ? item.update : []),
    ...(Array.isArray(data?.update) ? data.update : []),
  ].map(asRecord).filter((value): value is JsonRecord => Boolean(value));
  return update?.status ?? dataUpdate?.status ?? updateItems.find((value) => value.status !== undefined)?.status ?? item.status ?? data?.status;
}

function statusRank(status: WhatsappStatus): number {
  return { PENDING: 1, SENT: 2, SERVER_ACK: 3, DELIVERY_ACK: 4, READ: 5, PLAYED: 6, RECEIVED: 7, FAILED: 8 }[status];
}

function shouldApplyStatus(current: WhatsappStatus | undefined, incoming: WhatsappStatus): boolean {
  if (!current || current === "FAILED" || incoming === "FAILED") return true;
  return statusRank(incoming) >= statusRank(current);
}

function statusTimestamps(status: WhatsappStatus, timestamp: string): { deliveredAt?: string; readAt?: string; failedAt?: string } {
  return {
    deliveredAt: ["DELIVERY_ACK", "READ", "PLAYED"].includes(status) ? timestamp : undefined,
    readAt: ["READ", "PLAYED"].includes(status) ? timestamp : undefined,
    failedAt: status === "FAILED" ? timestamp : undefined,
  };
}

async function processIncomingMessage(item: JsonRecord): Promise<boolean> {
  if (isFromMe(item)) return false;
  const phone = phoneFromJid(getRemoteJid(item));
  if (!phone) return false;
  const lead = await findLeadByPhone(phone);
  if (!lead) return false;

  const providerMessageId = extractEvolutionMessageId(item);
  const body = extractMessageBody(item);
  const createdAt = getMessageTimestamp(item);
  const existing = providerMessageId ? await findLeadMessageByProviderId(providerMessageId) : null;
  if (existing) {
    await updateLeadMessage(existing.id, { status: "RECEIVED", body, phone, rawPayload: item });
  } else {
    await createLeadMessage({ leadId: lead.id, providerMessageId, direction: "INBOUND", status: "RECEIVED", body, phone, createdAt, rawPayload: item });
  }
  await markLeadCustomerReply(lead.id, body, createdAt);
  return true;
}

async function processOutboundEvent(item: JsonRecord): Promise<boolean> {
  if (!isFromMe(item)) return false;
  const providerMessageId = extractEvolutionMessageId(item);
  if (!providerMessageId) return false;
  const incomingStatus = normalizeEvolutionStatus(getStatusValue(item));
  const existing = await findLeadMessageByProviderId(providerMessageId);
  const timestamp = getMessageTimestamp(item);
  if (existing) {
    if (!shouldApplyStatus(existing.status, incomingStatus)) return false;
    await updateLeadMessage(existing.id, { status: incomingStatus, rawPayload: item, ...statusTimestamps(incomingStatus, timestamp) });
    if (existing.direction === "OUTBOUND") await updateLeadWhatsappStatus(existing.leadId, incomingStatus);
    return true;
  }

  const phone = phoneFromJid(getRemoteJid(item));
  if (!phone) return false;
  const lead = await findLeadByPhone(phone);
  if (!lead) return false;
  await createLeadMessage({ leadId: lead.id, providerMessageId, direction: "OUTBOUND", status: incomingStatus, body: extractMessageBody(item), phone, createdAt: timestamp, rawPayload: item, ...statusTimestamps(incomingStatus, timestamp) });
  await updateLeadWhatsappStatus(lead.id, incomingStatus);
  return true;
}

export async function POST(request: Request) {
  const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
  const receivedToken = request.headers.get("x-evolution-webhook-token");
  if (!expectedToken || receivedToken !== expectedToken) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  let payload: JsonRecord;
  try {
    const parsed: unknown = await request.json();
    const record = asRecord(parsed);
    if (!record) return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
    payload = record;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const event = normalizeEvent(payload.event ?? payload.type);
  const items = flattenEventData(payload.data ?? payload);
  let processed = 0;
  for (const item of items) {
    const handled = event === "MESSAGES_UPSERT" || event === "MESSAGES_SET"
      ? await processIncomingMessage(item) || await processOutboundEvent(item)
      : event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE"
        ? await processOutboundEvent(item)
        : false;
    if (handled) processed += 1;
  }

  return NextResponse.json({ success: true, event, received: items.length, processed });
}
