import { NextResponse } from "next/server";

import { validateWhatsappReminderDispatcherRequest } from "@/lib/auth/entrypoints";
import {
  getWhatsappReminderRuntimeConfig,
  sendWhatsappReminderText,
  WhatsappReminderProviderError,
} from "@/lib/whatsapp/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 20;
const SUPABASE_REQUEST_TIMEOUT_MS = 8000;

type JsonRecord = Record<string, unknown>;

type ReminderDelivery = {
  id: string;
  effect_id: string;
  action_id: string;
  action_version: number;
  destination_id: string;
  evolution_instance: string;
  recipient: string;
  lead_name: string;
  lead_phone: string;
  car_models: string[];
  action_type: string;
  scheduled_for: string;
  note: string | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asDelivery(value: unknown): ReminderDelivery | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const effectId = asString(record.effect_id);
  const actionId = asString(record.action_id);
  const destinationId = asString(record.destination_id);
  const evolutionInstance = asString(record.evolution_instance);
  const recipient = asString(record.recipient);
  const leadName = asString(record.lead_name);
  const leadPhone = asString(record.lead_phone);
  const actionType = asString(record.action_type);
  const scheduledFor = asString(record.scheduled_for);
  const actionVersion = typeof record.action_version === "number" ? record.action_version : Number(record.action_version);
  const models = Array.isArray(record.car_models) ? record.car_models.filter((model): model is string => typeof model === "string" && model.trim().length > 0) : [];
  if (!id || !effectId || !actionId || !destinationId || !evolutionInstance || !recipient || !leadName || !leadPhone || !actionType || !scheduledFor || !Number.isInteger(actionVersion)) return null;
  return {
    id,
    effect_id: effectId,
    action_id: actionId,
    action_version: actionVersion,
    destination_id: destinationId,
    evolution_instance: evolutionInstance,
    recipient,
    lead_name: leadName,
    lead_phone: leadPhone,
    car_models: models,
    action_type: actionType,
    scheduled_for: scheduledFor,
    note: typeof record.note === "string" && record.note.trim() ? record.note.trim() : null,
  };
}

function getAdminRestConfig(): { url: string; serviceRoleKey: string } | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/$/u, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

async function adminRest(path: string, init?: RequestInit): Promise<Response | null> {
  const config = getAdminRestConfig();
  if (!config) return null;
  return fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS),
  });
}

async function adminRpc(name: string, body: JsonRecord): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await adminRest(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  if (!response) return { ok: false, status: 503, data: null };
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
}

function isEnabled(): boolean {
  return process.env.WHATSAPP_REMINDER_ENABLED?.trim().toLowerCase() === "true";
}

function formatScheduledFor(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "hora no disponible";
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatReminderMessage(delivery: ReminderDelivery): string {
  const actionLabels: Record<string, string> = {
    CALL: "Llamar",
    WHATSAPP: "Escribir por WhatsApp",
    QUOTE: "Cotizar",
    OTHER: "Dar seguimiento",
    RESPONSE: "Responder al cliente",
  };
  const lines = [
    "LeadFlow · Recordatorio",
    "",
    delivery.lead_name,
    `${actionLabels[delivery.action_type] || "Dar seguimiento"} · ${formatScheduledFor(delivery.scheduled_for)}`,
    `Teléfono: ${delivery.lead_phone}`,
  ];
  if (delivery.car_models.length > 0) lines.push(`Modelo: ${delivery.car_models.join(", ")}`);
  if (delivery.note) lines.push(`Nota: ${delivery.note}`);
  return lines.join("\n");
}

function resultForProviderError(error: unknown): { result: "FAILED" | "UNKNOWN"; providerStatus: string } {
  if (error instanceof WhatsappReminderProviderError) {
    const providerStatus = error.statusCode === null ? `ERROR:${error.name}` : `HTTP_${error.statusCode}`;
    return { result: error.definitive ? "FAILED" : "UNKNOWN", providerStatus };
  }
  return { result: "UNKNOWN", providerStatus: "ERROR:UNKNOWN" };
}

async function recordResult(
  delivery: ReminderDelivery,
  attemptNo: number,
  claimTokenDigest: string,
  result: "ACCEPTED" | "FAILED" | "UNKNOWN",
  providerMessageId: string | null,
  providerStatus: string,
): Promise<boolean> {
  const recorded = await adminRpc("record_whatsapp_reminder_result_v1", {
    p_delivery_id: delivery.id,
    p_attempt_no: attemptNo,
    p_claim_token_digest: claimTokenDigest,
    p_result_kind: result,
    p_provider_message_id: providerMessageId,
    p_provider_status: providerStatus,
    p_recorded_at: new Date().toISOString(),
  });
  if (!recorded.ok) {
    console.error("whatsapp_reminder_result_record_failed", JSON.stringify({ deliveryId: delivery.id, statusCode: recorded.status }));
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  if (!validateWhatsappReminderDispatcherRequest(request.headers)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!isEnabled()) {
    return NextResponse.json({ enabled: false, materialized: 0, results: [] }, { headers: { "cache-control": "no-store" } });
  }

  const config = getWhatsappReminderRuntimeConfig();
  if (!config) {
    console.error("whatsapp_reminder_configuration_invalid");
    return NextResponse.json({ error: "WHATSAPP_REMINDER_CONFIGURATION_INVALID" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const materialized = await adminRpc("materialize_whatsapp_reminder_deliveries_v1", {
    p_destination_id: "advisor-whatsapp",
    p_evolution_instance: config.reminderInstance,
    p_recipient: config.recipient,
    p_now: now,
  });
  if (!materialized.ok) {
    console.error("whatsapp_reminder_materialization_failed", JSON.stringify({ statusCode: materialized.status }));
    return NextResponse.json({ error: "MATERIALIZE_FAILED" }, { status: 502 });
  }

  const dueResponse = await adminRest(`whatsapp_reminder_deliveries?status=eq.SCHEDULED&scheduled_for=lte.${encodeURIComponent(now)}&order=scheduled_for.asc&limit=${MAX_BATCH_SIZE}&select=*`);
  if (!dueResponse?.ok) {
    console.error("whatsapp_reminder_deliveries_unavailable", JSON.stringify({ statusCode: dueResponse?.status ?? 503 }));
    return NextResponse.json({ error: "DELIVERIES_UNAVAILABLE" }, { status: 502 });
  }

  const duePayload: unknown = await dueResponse.json().catch(() => null);
  const dueDeliveries = Array.isArray(duePayload) ? duePayload.map(asDelivery).filter((delivery): delivery is ReminderDelivery => Boolean(delivery)) : [];
  const results: Array<{ id: string; status: string }> = [];

  for (const candidate of dueDeliveries) {
    const claim = await adminRpc("claim_whatsapp_reminder_delivery_v1", { p_delivery_id: candidate.id, p_now: new Date().toISOString() });
    const claimData = asRecord(claim.data);
    if (!claim.ok || claimData?.status !== "CLAIMED") {
      results.push({ id: candidate.id, status: claimData?.status === "CANCELED" ? "CANCELED" : claim.ok ? String(claimData?.status || "CLAIM_NOT_APPLIED") : "CLAIM_FAILED" });
      continue;
    }

    const attemptNo = typeof claimData.attempt_no === "number" ? claimData.attempt_no : Number(claimData.attempt_no);
    const claimTokenDigest = asString(claimData.claim_token_digest);
    if (!Number.isInteger(attemptNo) || !claimTokenDigest) {
      results.push({ id: candidate.id, status: "CLAIM_INVALID" });
      continue;
    }

    const claimedResponse = await adminRest(`whatsapp_reminder_deliveries?id=eq.${encodeURIComponent(candidate.id)}&status=eq.CLAIMED&select=*`);
    const claimedPayload: unknown = claimedResponse?.ok ? await claimedResponse.json().catch(() => null) : null;
    const [claimed] = Array.isArray(claimedPayload) ? claimedPayload.map(asDelivery).filter((delivery): delivery is ReminderDelivery => Boolean(delivery)) : [];
    if (!claimed) {
      results.push({ id: candidate.id, status: "CLAIMED_DELIVERY_MISSING" });
      continue;
    }

    const revalidated = await adminRpc("revalidate_whatsapp_reminder_delivery_v1", { p_delivery_id: claimed.id, p_attempt_no: attemptNo, p_claim_token_digest: claimTokenDigest, p_now: new Date().toISOString() });
    const revalidatedData = asRecord(revalidated.data);
    if (!revalidated.ok || revalidatedData?.status !== "READY_FOR_IO") {
      results.push({ id: claimed.id, status: revalidatedData?.status === "CANCELED" ? "CANCELED" : revalidated.ok ? String(revalidatedData?.status || "REVALIDATION_NOT_APPLIED") : "REVALIDATION_FAILED" });
      continue;
    }

    try {
      const sent = await sendWhatsappReminderText(config, formatReminderMessage(claimed));
      const result = sent.providerMessageId ? "ACCEPTED" : "UNKNOWN";
      const providerStatus = sent.providerStatus;
      const recorded = await recordResult(claimed, attemptNo, claimTokenDigest, result, sent.providerMessageId, providerStatus);
      results.push({ id: claimed.id, status: recorded ? result : "RESULT_RECORD_FAILED" });
      console.info("whatsapp_reminder_provider_result", JSON.stringify({ deliveryId: claimed.id, actionId: claimed.action_id, actionVersion: claimed.action_version, destinationId: claimed.destination_id, evolutionInstance: claimed.evolution_instance, providerStatus, result, recorded }));
    } catch (error) {
      const provider = resultForProviderError(error);
      const recorded = await recordResult(claimed, attemptNo, claimTokenDigest, provider.result, null, provider.providerStatus);
      results.push({ id: claimed.id, status: recorded ? provider.result : "RESULT_RECORD_FAILED" });
      console.error("whatsapp_reminder_provider_result", JSON.stringify({ deliveryId: claimed.id, actionId: claimed.action_id, actionVersion: claimed.action_version, destinationId: claimed.destination_id, evolutionInstance: claimed.evolution_instance, providerStatus: provider.providerStatus, result: provider.result, recorded }));
    }
  }

  return NextResponse.json({ enabled: true, materialized: typeof materialized.data === "number" ? materialized.data : 0, results }, { headers: { "cache-control": "no-store" } });
}
