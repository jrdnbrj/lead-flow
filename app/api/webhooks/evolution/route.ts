import { NextResponse } from "next/server";

import { validateEvolutionWebhookRequest } from "@/lib/auth/entrypoints";
import type { WhatsappStatus } from "@/lib/domain/lead";
import { formatPhoneForWhatsapp } from "@/lib/domain/lead";
import { classifyInboundMessage } from "@/lib/leads/inbound-classifier";
import { InboundMessageLedger } from "@/lib/leads/inbound-dedup";
import { normalizeInboundPayload } from "@/lib/leads/inbound-dto";
import { getResponseReminderAt } from "@/lib/leads/follow-up";
import { createLeadMessageForProvider, findLeadByPhoneForProvider, findLeadMessageByProviderIdForProvider, markLeadAfterOutboundMessageForProvider, markLeadConversationActiveForProvider, markLeadCustomerReplyForProvider, persistInboundMessageForProvider, resolveInboundLeadMatchForProvider, updateLeadMessageForProvider, upsertInboundResponseActionForProvider } from "@/lib/leads/repository";
import { extractEvolutionMessageId, normalizeEvolutionStatus } from "@/lib/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVOLUTION_INSTANCE = process.env.EVOLUTION_API_INSTANCE_NAME?.trim() ?? "";

type JsonRecord = Record<string, unknown>;
type WebhookProcessingResult = { handled: boolean; retryable: boolean };

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEvent(value: unknown): string {
  return asString(value)?.toUpperCase().replace(/[.\s-]+/g, "_") ?? "";
}

function extractEvolutionInstance(value: JsonRecord, parentInstance: string | null): string | null {
  const data = asRecord(value.data);
  return asString(value.instance)
    ?? asString(value.instanceName)
    ?? asString(data?.instance)
    ?? asString(data?.instanceName)
    ?? parentInstance;
}

function belongsToCustomerInstance(value: JsonRecord, parentInstance: string | null): boolean {
  const instance = extractEvolutionInstance(value, parentInstance);
  return Boolean(EVOLUTION_INSTANCE && instance && instance === EVOLUTION_INSTANCE);
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
  const messageKey = asRecord(asRecord(item.message)?.key);
  const dataMessageKey = asRecord(asRecord(data?.message)?.key);
  const remoteJid = asString(key?.remoteJid) ?? asString(dataKey?.remoteJid) ?? asString(messageKey?.remoteJid) ?? asString(dataMessageKey?.remoteJid) ?? asString(item.remoteJid) ?? asString(item.recipientJid);
  const remoteJidAlt = asString(key?.remoteJidAlt) ?? asString(dataKey?.remoteJidAlt) ?? asString(messageKey?.remoteJidAlt) ?? asString(dataMessageKey?.remoteJidAlt) ?? asString(item.remoteJidAlt);
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
  const messageKey = asRecord(asRecord(item.message)?.key);
  const dataMessageKey = asRecord(asRecord(asRecord(item.data)?.message)?.key);
  const values = [key?.fromMe, dataKey?.fromMe, messageKey?.fromMe, dataMessageKey?.fromMe, item.fromMe];
  return values.some((value) => value === true || value === "true");
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

async function processIncomingMessage(item: JsonRecord, event: string, ledger: InboundMessageLedger): Promise<WebhookProcessingResult> {
  const normalized = normalizeInboundPayload(item, event, EVOLUTION_INSTANCE);
  if (!normalized.accepted) return { handled: false, retryable: false };
  const identity = ledger.accept({ evolutionInstance: normalized.dto.evolutionInstance, providerMessageId: normalized.dto.providerMessageId });
  if (!identity.accepted) return { handled: "replay" in identity && identity.replay, retryable: false };

  const classification = classifyInboundMessage(normalized.dto.body ?? "").classification;
  const match = await resolveInboundLeadMatchForProvider(normalized.dto.phone);
  if (match.status === "NO_MATCH") return { handled: false, retryable: false };
  const persisted = await persistInboundMessageForProvider({
    leadId: match.leadId,
    evolutionInstance: normalized.dto.evolutionInstance,
    providerMessageId: normalized.dto.providerMessageId,
    phone: normalized.dto.phone,
    body: normalized.dto.body,
    createdAt: normalized.dto.timestamp,
    classification,
    associationStatus: match.status === "AMBIGUOUS" ? "AMBIGUOUS" : "MATCHED",
    matchAmbiguous: match.status === "AMBIGUOUS",
  });
  if (!persisted) return { handled: false, retryable: true };
  if (persisted.replayed === true || persisted.status === "REPLAYED") return { handled: true, retryable: false };
  const replyProjection = await markLeadCustomerReplyForProvider(match.leadId, normalized.dto.body, normalized.dto.timestamp, classification);
  if (!replyProjection.ok) return { handled: false, retryable: true };
  if (replyProjection.stale) return { handled: true, retryable: false };
  if (classification === "NO_SUGGESTION") return { handled: true, retryable: false };
  const sourceMessageId = typeof persisted.message_id === "string" ? persisted.message_id : null;
  if (!sourceMessageId) return { handled: false, retryable: true };
  const scheduledFor = getResponseReminderAt(normalized.dto.timestamp);
  const action = await upsertInboundResponseActionForProvider({
    leadId: match.leadId,
    sourceMessageId,
    classification,
    scheduledFor,
    idempotencyKey: `evolution-inbound-response:${normalized.dto.evolutionInstance}:${normalized.dto.providerMessageId}`,
  });
  const actionApplied = Boolean(action) && await markLeadConversationActiveForProvider(match.leadId);
  return { handled: actionApplied, retryable: !actionApplied };
}

async function processOutboundEvent(item: JsonRecord): Promise<boolean> {
  if (!isFromMe(item)) return false;
  const providerMessageId = extractEvolutionMessageId(item);
  if (!providerMessageId || !EVOLUTION_INSTANCE) return false;
  const incomingStatus = normalizeEvolutionStatus(getStatusValue(item));
  const existing = await findLeadMessageByProviderIdForProvider(providerMessageId, EVOLUTION_INSTANCE);
  const timestamp = getMessageTimestamp(item);
  if (existing) {
    if (!shouldApplyStatus(existing.status, incomingStatus)) return false;
    await updateLeadMessageForProvider(existing.id, { status: incomingStatus, rawPayload: item, ...statusTimestamps(incomingStatus, timestamp) });
    if (existing.direction === "OUTBOUND") await markLeadAfterOutboundMessageForProvider(existing.leadId, incomingStatus, timestamp);
    return true;
  }

  const phone = phoneFromJid(getRemoteJid(item));
  if (!phone) return false;
  const lead = await findLeadByPhoneForProvider(phone);
  if (!lead) return false;
  const createdId = await createLeadMessageForProvider({ leadId: lead.id, evolutionInstance: EVOLUTION_INSTANCE, providerMessageId, direction: "OUTBOUND", status: incomingStatus, body: extractMessageBody(item), phone, createdAt: timestamp, rawPayload: item, ...statusTimestamps(incomingStatus, timestamp) });
  if (!createdId) {
    // Evolution can replay the same event while the provider insert is still
    // being committed. Treat the already-persisted message as handled and
    // keep the webhook idempotent.
    return Boolean(await findLeadMessageByProviderIdForProvider(providerMessageId, EVOLUTION_INSTANCE));
  }
  await markLeadAfterOutboundMessageForProvider(lead.id, incomingStatus, timestamp);
  return true;
}

export async function POST(request: Request) {
  if (!validateEvolutionWebhookRequest(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

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
  const payloadInstance = extractEvolutionInstance(payload, null);
  const items = flattenEventData(payload.data ?? payload);
  const inboundLedger = new InboundMessageLedger();
  let processed = 0;
  let retryableFailures = 0;
  for (const item of items) {
    // Authenticate and isolate the Evolution instance before any phone
    // matching, persistence, or RESPONSE projection. The reminder instance
    // is intentionally not allowed to enter the customer inbound pipeline.
    if (!belongsToCustomerInstance(item, payloadInstance)) continue;
    let handled = false;
    if (event === "MESSAGES_UPSERT" || event === "MESSAGES_SET") {
      const inbound = await processIncomingMessage(item, event, inboundLedger);
      retryableFailures += inbound.retryable ? 1 : 0;
      handled = inbound.handled || (!inbound.retryable && await processOutboundEvent(item));
    } else if (event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE") {
      handled = await processOutboundEvent(item);
    }
    if (handled) processed += 1;
  }

  if (retryableFailures > 0) return NextResponse.json({ success: false, error: "Retryable webhook processing failure", event, received: items.length, processed }, { status: 503 });
  return NextResponse.json({ success: true, event, received: items.length, processed });
}
