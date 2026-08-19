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
  missingInstance?: boolean;
};

export type EvolutionQrResult = {
  qr: string | null;
  state: EvolutionConnectionState | null;
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
  if ((text.includes("not found") || text.includes("does not exist")) && text.includes("instance")) {
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
    const missingInstance = stateResponse.status === 404;
    if (!stateResponse.ok || state !== "open") {
      return {
        state: missingInstance ? "close" : state,
        ready: false,
        error: getEvolutionErrorMessage(stateResponse.status, statePayload, "Todavía no pudimos confirmar la conexión de WhatsApp. Intenta actualizarla."),
        missingInstance,
      };
    }

    // Do not probe with a synthetic phone number here. Evolution can reject
    // that number independently of the session state, which would turn a
    // valid linked session into a false "disconnected" result.
    return { state: "open", ready: true, error: null };
  } catch {
    return { state: null, ready: false, error: "No pudimos consultar la conexión de WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
}

export function extractEvolutionQr(payload: unknown): string | null {
  const record = asRecord(payload);
  const nestedQr = asRecord(record?.qrcode);
  const candidates = [record?.base64, nestedQr?.base64, record?.code, nestedQr?.code];
  const qr = candidates.find((value) => typeof value === "string" && value.startsWith("data:image/"));
  return typeof qr === "string" ? qr : null;
}

export async function getEvolutionConnectionQr(): Promise<EvolutionQrResult> {
  const config = getEvolutionConfig();
  if (!config) return { qr: null, state: null, error: "La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa." };

  try {
    const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(config.instanceName)}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    const qr = extractEvolutionQr(payload);
    // During logout Evolution can briefly report the old `open` state while
    // the connect endpoint already contains the new QR. Trust the QR payload
    // before the lagging state endpoint so the UI never hides a valid code.
    if (qr) return { qr, state: "connecting", error: null };

    const current = await getEvolutionConnectionStatus();
    if (current.ready) return { qr: null, state: "open", error: null };
    if (!response.ok) return { qr: null, state: current.state, error: getEvolutionErrorMessage(response.status, payload, "No pudimos actualizar el código QR. Intenta nuevamente.") };

    return {
      qr,
      state: qr ? "connecting" : current.state,
      error: qr ? null : "Evolution no entregó un código QR vigente. Intenta generar otro QR.",
    };
  } catch {
    return { qr: null, state: null, error: "No pudimos actualizar el código QR. Intenta nuevamente." };
  }
}

let ensureEvolutionInstancePromise: Promise<{ ok: boolean; error: string | null }> | null = null;

const EVOLUTION_RETRY_DELAY_MS = 750;
const EVOLUTION_INSTANCE_SETTLE_DELAY_MS = 2500;
const EVOLUTION_CLOSE_WAIT_ATTEMPTS = 40;
const EVOLUTION_PAIRING_WAIT_ATTEMPTS = 80;

export async function waitForEvolutionConnectionToClose(): Promise<boolean> {
  for (let attempt = 0; attempt < EVOLUTION_CLOSE_WAIT_ATTEMPTS; attempt += 1) {
    const status = await getEvolutionConnectionStatus();
    if (status.missingInstance || status.state === "close") return true;
    await new Promise((resolve) => setTimeout(resolve, EVOLUTION_RETRY_DELAY_MS));
  }
  return false;
}

export type EvolutionPairingState = {
  ready: boolean;
  state: EvolutionConnectionState | null;
  hasQr: boolean;
};

/**
 * Logout can transition directly from open to connecting while Evolution
 * starts a fresh QR session. Treat that as a successful pairing handoff; it
 * is not a closed instance that needs to be deleted and recreated.
 */
export async function waitForEvolutionPairingState(): Promise<EvolutionPairingState> {
  for (let attempt = 0; attempt < EVOLUTION_PAIRING_WAIT_ATTEMPTS; attempt += 1) {
    const status = await getEvolutionConnectionStatus();
    if (status.missingInstance || status.state === "close") {
      return { ready: true, state: status.state, hasQr: false };
    }

    const qr = await getEvolutionConnectionQr();
    if (qr.qr) return { ready: true, state: "connecting", hasQr: true };

    await new Promise((resolve) => setTimeout(resolve, EVOLUTION_RETRY_DELAY_MS));
  }

  const finalStatus = await getEvolutionConnectionStatus();
  return { ready: false, state: finalStatus.state, hasQr: false };
}

export async function recreateEvolutionInstanceAfterCleanup(): Promise<{ ok: boolean; error: string | null }> {
  const current = await getEvolutionConnectionStatus();
  if (current.state === "open" && !(await waitForEvolutionConnectionToClose())) {
    return { ok: false, error: "WhatsApp todavía está cerrando la conexión anterior. Intenta de nuevo en unos segundos." };
  }

  // Evolution 2.3.x may recreate the pairing session immediately after the
  // delete response. Allow that authoritative state to win instead of
  // requiring a short-lived 404 window that the provider may skip.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pairing = await waitForEvolutionPairingState();
    if (pairing.hasQr) {
      const webhookReady = await ensureEvolutionWebhook();
      return webhookReady
        ? { ok: true, error: null }
        : { ok: false, error: "La conexión se preparó, pero no pudimos dejar lista la recepción de mensajes. Intenta de nuevo." };
    }

    const ensured = await ensureEvolutionInstance();
    if (ensured.ok) return ensured;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, EVOLUTION_INSTANCE_SETTLE_DELAY_MS));
  }

  return { ok: false, error: "No pudimos preparar la nueva conexión de WhatsApp. Intenta de nuevo." };
}

export async function resetEvolutionInstanceForPairing(): Promise<{ ok: boolean; error: string | null }> {
  const config = getEvolutionConfig();
  if (!config) return { ok: false, error: "La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa." };

  try {
    const current = await getEvolutionConnectionStatus();
    if (current.state === "connecting") {
      const qr = await getEvolutionConnectionQr();
      if (qr.qr) {
        const webhookReady = await ensureEvolutionWebhook();
        return webhookReady
          ? { ok: true, error: null }
          : { ok: false, error: "La conexión se preparó, pero no pudimos dejar lista la recepción de mensajes. Intenta de nuevo." };
      }
    }

    const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/instance/delete/${encodeURIComponent(config.instanceName)}`, {
      method: "DELETE",
      headers: { apikey: config.apiKey },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok && response.status !== 404) {
      return { ok: false, error: getEvolutionErrorMessage(response.status, payload, "No pudimos preparar un QR nuevo. Intenta de nuevo.") };
    }
    return recreateEvolutionInstanceAfterCleanup();
  } catch {
    return { ok: false, error: "No pudimos preparar un QR nuevo. Revisa tu conexión e inténtalo de nuevo." };
  }
}

export function ensureEvolutionInstance(): Promise<{ ok: boolean; error: string | null }> {
  if (ensureEvolutionInstancePromise) return ensureEvolutionInstancePromise;

  const pending = createEvolutionInstance();
  const guarded = pending.finally(() => {
    if (ensureEvolutionInstancePromise === guarded) ensureEvolutionInstancePromise = null;
  });
  ensureEvolutionInstancePromise = guarded;
  return guarded;
}

async function createEvolutionInstance(): Promise<{ ok: boolean; error: string | null }> {
  const config = getEvolutionConfig();
  if (!config) return { ok: false, error: "La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa." };

  try {
    const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({
        instanceName: config.instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        rejectCall: false,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    const text = collectErrorText(payload).join(" ").toLowerCase();
    if (!response.ok) {
      if (response.status !== 409 || (!text.includes("already exists") && !text.includes("already connected"))) {
        return { ok: false, error: getEvolutionErrorMessage(response.status, payload, "No pudimos preparar la conexión de WhatsApp. Intenta de nuevo.") };
      }
      const current = await getEvolutionConnectionStatus();
      if (current.missingInstance || current.state === null) {
        return { ok: false, error: "La conexión de WhatsApp está cambiando. Intenta generar el QR nuevamente." };
      }
    }

    if (!(await ensureEvolutionWebhook())) {
      return { ok: false, error: "La conexión se creó, pero no pudimos dejarla lista para recibir mensajes. Intenta de nuevo." };
    }
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "No pudimos preparar la conexión de WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
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
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.ok) return true;
    } catch {
      // Evolution may still be initializing a newly-created instance.
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
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

export async function sendWhatsappDocument(input: { phone: string; documentUrl: string; caption?: string; fileName: string }): Promise<EvolutionSendResult> {
  const config = getEvolutionConfig();
  if (!config) throw new Error("La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa.");

  const normalizedPhone = normalizeWhatsappNumber(input.phone);
  const phoneError = getWhatsappPhoneError(input.phone);
  if (!normalizedPhone || phoneError) throw new Error(phoneError || "El número de WhatsApp no es válido.");

  const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(config.instanceName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: normalizedPhone, mediatype: "document", mimetype: "application/pdf", media: input.documentUrl, caption: input.caption || "", fileName: input.fileName, delay: 0 }),
    cache: "no-store",
  });
  const rawPayload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(getEvolutionErrorMessage(response.status, rawPayload, "El mensaje se envió, pero no pudimos adjuntar la ficha técnica."));
  return { providerMessageId: extractEvolutionMessageId(rawPayload), status: normalizeEvolutionStatus(asRecord(rawPayload)?.status), payload: asRecord(rawPayload) };
}
