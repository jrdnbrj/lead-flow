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
  const key = asRecord(record?.key);
  const message = asRecord(record?.message);
  const nestedKey = asRecord(message?.key);
  const candidate = key?.id ?? nestedKey?.id ?? record?.messageId ?? record?.id;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
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
    throw new Error("Evolution API no está configurada. Revisa EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_API_INSTANCE_NAME.");
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
    const responseRecord = asRecord(rawPayload)?.response;
    const responseMessages = asRecord(responseRecord)?.message;
    const firstMessage = Array.isArray(responseMessages) ? asRecord(responseMessages[0]) : null;
    if (firstMessage?.exists === false) {
      throw new Error("No encontramos una cuenta de WhatsApp activa para ese número. Revisa el código de país y confirma que el celular tenga WhatsApp.");
    }
    throw new Error("WhatsApp no pudo aceptar el mensaje. Revisa el número y vuelve a intentarlo.");
  }

  return {
    providerMessageId: extractEvolutionMessageId(rawPayload),
    status: normalizeEvolutionStatus(asRecord(rawPayload)?.status),
    payload: asRecord(rawPayload),
  };
}
