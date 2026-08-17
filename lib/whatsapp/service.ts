import { getWhatsappPhoneError, normalizeWhatsappNumber } from "@/lib/domain/lead";
import type { WhatsappStatus } from "@/lib/domain/lead";

interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface EvolutionSendResult {
  providerMessageId: string | null;
  status: WhatsappStatus;
  payload: Record<string, unknown> | null;
}

export type EvolutionConnectionState = "open" | "connecting" | "close" | "unknown";

export type EvolutionConnectionResult = {
  state: EvolutionConnectionState | null;
  ready: boolean;
  error: string | null;
};

function getEvolutionConfig(): EvolutionConfig | null {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_API_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instanceName) return null;
  return { apiUrl, apiKey, instanceName };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function collectErrorText(value: unknown, parts: string[] = []): string[] {
  if (typeof value === "string") parts.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectErrorText(item, parts));
  else {
    const record = asRecord(value);
    if (record) Object.values(record).forEach((item) => collectErrorText(item, parts));
  }
  return parts;
}

export function getEvolutionErrorMessage(statusCode: number, payload: unknown, fallback = "WhatsApp no pudo procesar la solicitud. Intenta nuevamente."): string {
  const text = collectErrorText(payload).join(" ").toLowerCase();
  if (statusCode === 428 || text.includes("connection closed") || text.includes("connection is closed")) {
    return "WhatsApp necesita volver a vincularse. Desconecta la cuenta y escanea un código QR nuevo.";
  }
  const response = asRecord(asRecord(payload)?.response);
  const messages = response?.message;
  const firstMessage = Array.isArray(messages) ? asRecord(messages[0]) : null;
  if (firstMessage?.exists === false || text.includes("exists false") || text.includes("number does not exist")) {
    return "No encontramos una cuenta de WhatsApp activa para ese número. Revisa el código de país y confirma que el celular tenga WhatsApp.";
  }
  if (text.includes("not found") && text.includes("instance")) {
    return "No encontramos la conexión de WhatsApp. Intenta vincularla de nuevo y avísame si continúa.";
  }
  if (text.includes("already connected") || text.includes("already open")) {
    return "WhatsApp ya está vinculado. Actualiza el estado antes de generar otro QR.";
  }
  return fallback;
}

export function normalizeEvolutionConnectionState(value: unknown): EvolutionConnectionState {
  const state = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "") : "";
  if (["open", "connected", "online", "ready"].includes(state)) return "open";
  if (["connecting", "pairing", "qr", "qrcode", "awaitingpairing"].includes(state)) return "connecting";
  if (["close", "closed", "disconnected", "offline", "logout", "loggedout"].includes(state)) return "close";
  return "unknown";
}

export async function getEvolutionConnectionStatus(): Promise<EvolutionConnectionResult> {
  const config = getEvolutionConfig();
  if (!config) return { state: null, ready: false, error: "La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa." };

  const baseUrl = config.apiUrl.replace(/\/$/, "");
  try {
    const stateResponse = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`, { headers: { apikey: config.apiKey }, cache: "no-store" });
    const statePayload = await stateResponse.json().catch(() => null);
    const stateRecord = asRecord(statePayload);
    const instance = asRecord(stateRecord?.instance);
    const stateValue = instance?.state ?? stateRecord?.state;
    const state = normalizeEvolutionConnectionState(stateValue);
    if (!stateResponse.ok || state !== "open") return { state, ready: false, error: getEvolutionErrorMessage(stateResponse.status, statePayload, "Todavía no pudimos confirmar la conexión de WhatsApp. Intenta actualizarla.") };

    // Do not probe with a synthetic phone number here. Evolution can reject
    // that number independently of the session state, which would turn a
    // valid linked session into a false "disconnected" result.
    return { state: "open", ready: true, error: null };
  } catch {
    return { state: null, ready: false, error: "No pudimos consultar la conexión de WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
}

export function normalizeEvolutionStatus(value: unknown): WhatsappStatus {
  const numericStatuses: Record<number, WhatsappStatus> = {
    0: "FAILED",
    1: "PENDING",
    2: "SERVER_ACK",
    3: "DELIVERY_ACK",
    4: "READ",
    5: "PLAYED",
  };
  if (typeof value === "number" && numericStatuses[value]) return numericStatuses[value];

  const status = typeof value === "string" ? value.toUpperCase() : "";
  if (["PENDING", "SENT", "SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED", "FAILED"].includes(status)) {
    return status as WhatsappStatus;
  }
  return "SENT";
}

export function extractEvolutionMessageId(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;

  const data = asRecord(record.data);
  const message = asRecord(record.message);
  const dataMessage = asRecord(data?.message);
  const candidates: unknown[] = [
    asRecord(record.key)?.id,
    asRecord(data?.key)?.id,
    asRecord(message?.key)?.id,
    asRecord(dataMessage?.key)?.id,
    record.messageId,
    record.keyId,
    record.id,
    data?.messageId,
    data?.keyId,
    data?.id,
  ];

  const updates = [
    ...(Array.isArray(record.update) ? record.update : []),
    ...(Array.isArray(data?.update) ? data.update : []),
  ];
  updates.forEach((update) => {
    const updateRecord = asRecord(update);
    if (updateRecord) candidates.push(updateRecord.keyId, updateRecord.messageId, updateRecord.id, asRecord(updateRecord.key)?.id);
  });

  const candidate = candidates.find((item) => typeof item === "string" && item.length > 0);
  return typeof candidate === "string" ? candidate : null;
}

export async function ensureEvolutionWebhook(): Promise<boolean> {
  const config = getEvolutionConfig();
  const webhookUrl = process.env.EVOLUTION_WEBHOOK_URL;
  const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN;

  if (!config || !webhookUrl || !webhookToken) return false;

  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/webhook/set/${encodeURIComponent(config.instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        headers: { "x-evolution-webhook-token": webhookToken },
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"],
      },
    }),
    cache: "no-store",
  });
  return response.ok;
}

export async function sendWhatsappText(input: { phone: string; text: string }): Promise<EvolutionSendResult> {
  const config = getEvolutionConfig();
  if (!config) {
    throw new Error("La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa.");
  }

  const normalizedPhone = normalizeWhatsappNumber(input.phone);
  const phoneError = getWhatsappPhoneError(input.phone);
  if (!normalizedPhone || phoneError) throw new Error(phoneError || "El número de WhatsApp no es válido.");

  const endpoint = `${config.apiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(config.instanceName)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: normalizedPhone, text: input.text, delay: 0 }),
    cache: "no-store",
  });

  const rawPayload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getEvolutionErrorMessage(response.status, rawPayload, "WhatsApp no pudo aceptar el mensaje. Revisa el número y vuelve a intentarlo."));
  }

  return {
    providerMessageId: extractEvolutionMessageId(rawPayload),
    status: normalizeEvolutionStatus(asRecord(rawPayload)?.status),
    payload: asRecord(rawPayload),
  };
}

export async function sendWhatsappMedia(input: { phone: string; mediaUrl: string; caption?: string; fileName?: string }): Promise<EvolutionSendResult> {
  const config = getEvolutionConfig();
  if (!config) throw new Error("La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa.");

  const normalizedPhone = normalizeWhatsappNumber(input.phone);
  const phoneError = getWhatsappPhoneError(input.phone);
  if (!normalizedPhone || phoneError) throw new Error(phoneError || "El número de WhatsApp no es válido.");

  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(config.instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: normalizedPhone, mediatype: "image", media: input.mediaUrl, caption: input.caption || "", fileName: input.fileName || "leadflow-carro.jpg", delay: 0 }),
    cache: "no-store",
  });
  const rawPayload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getEvolutionErrorMessage(response.status, rawPayload, "El mensaje se envió, pero no pudimos adjuntar la imagen del vehículo."));
  return { providerMessageId: extractEvolutionMessageId(rawPayload), status: normalizeEvolutionStatus(asRecord(rawPayload)?.status), payload: asRecord(rawPayload) };
}
