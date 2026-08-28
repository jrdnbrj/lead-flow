import { getWhatsappPhoneError, normalizeWhatsappNumber } from "@/lib/domain/lead";
import { extractEvolutionMessageId } from "@/lib/whatsapp/service";

const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 15000;

export type WhatsappReminderRuntimeConfig = {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  customerInstance: string;
  reminderInstance: string;
  recipient: string;
  dispatchSecret: string;
  timeoutMs: number;
};

export class WhatsappReminderProviderError extends Error {
  readonly statusCode: number | null;
  readonly definitive: boolean;

  constructor(message: string, statusCode: number | null, definitive: boolean) {
    super(message);
    this.name = "WhatsappReminderProviderError";
    this.statusCode = statusCode;
    this.definitive = definitive;
  }
}

function parseEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(parsed)));
}

export function getWhatsappReminderRuntimeConfig(): WhatsappReminderRuntimeConfig | null {
  const enabled = parseEnabled(process.env.WHATSAPP_REMINDER_ENABLED);
  if (!enabled) return null;

  const apiUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/u, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const customerInstance = process.env.EVOLUTION_API_INSTANCE_NAME?.trim();
  const reminderInstance = process.env.WHATSAPP_REMINDER_EVOLUTION_INSTANCE?.trim();
  const recipientInput = process.env.WHATSAPP_REMINDER_RECIPIENT?.trim();
  const dispatchSecret = process.env.WHATSAPP_REMINDER_DISPATCH_SECRET?.trim();

  if (!apiUrl || !apiKey || !customerInstance || !reminderInstance || !recipientInput || !dispatchSecret) return null;
  if (reminderInstance === customerInstance) return null;

  const recipient = normalizeWhatsappNumber(recipientInput);
  if (!recipient || getWhatsappPhoneError(recipientInput)) return null;

  return {
    enabled,
    apiUrl,
    apiKey,
    customerInstance,
    reminderInstance,
    recipient,
    dispatchSecret,
    timeoutMs: parseTimeout(process.env.WHATSAPP_REMINDER_SEND_TIMEOUT_MS),
  };
}

function extractProviderErrorMessage(payload: unknown): string {
  if (typeof payload === "string") return payload.slice(0, 160);
  if (!payload || typeof payload !== "object") return "Evolution rechazó el recordatorio.";
  const values = Object.values(payload as Record<string, unknown>).filter((value): value is string => typeof value === "string");
  return (values[0] || "Evolution rechazó el recordatorio.").slice(0, 160);
}

export type WhatsappReminderSendResult = {
  providerMessageId: string | null;
  providerStatus: string;
};

export async function sendWhatsappReminderText(
  config: WhatsappReminderRuntimeConfig,
  text: string,
): Promise<WhatsappReminderSendResult> {
  if (config.reminderInstance === config.customerInstance) {
    throw new WhatsappReminderProviderError("Reminder instance is prohibited from using the customer instance.", null, true);
  }

  const response = await fetch(`${config.apiUrl}/message/sendText/${encodeURIComponent(config.reminderInstance)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: config.recipient, text, delay: 0 }),
    signal: AbortSignal.timeout(config.timeoutMs),
    cache: "no-store",
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Evolution no respondió.";
    throw new WhatsappReminderProviderError(message, null, false);
  });

  const payload: unknown = await response.json().catch(() => null);
  const providerMessageId = extractEvolutionMessageId(payload);
  const providerStatus = `HTTP_${response.status}`;
  if (!response.ok) {
    throw new WhatsappReminderProviderError(extractProviderErrorMessage(payload), response.status, response.status < 500 && response.status !== 408 && response.status !== 429);
  }
  if (!providerMessageId) {
    throw new WhatsappReminderProviderError("Evolution aceptó la solicitud, pero no entregó un identificador del mensaje.", response.status, false);
  }

  return { providerMessageId, providerStatus };
}
