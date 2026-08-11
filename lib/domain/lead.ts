export const leadTimeframes = [
  { value: "INMEDIATA", label: "Ya", helper: "Esta semana" },
  { value: "1_3_MESES", label: "1–3 meses", helper: "Próximo trimestre" },
  { value: "3_6_MESES", label: "3–6 meses", helper: "Lo estoy planeando" },
  { value: "EXPLORANDO", label: "Explorando", helper: "Quiero conocer opciones" },
] as const;

export const paymentMethods = [
  { value: "CREDITO", label: "Crédito" },
  { value: "CONTADO", label: "Contado" },
  { value: "LEASING", label: "Leasing" },
  { value: "POR_DEFINIR", label: "Por definir" },
] as const;

export const carModels = [
  "V3",
  "CS15 - Modelo 2027",
  "CS75",
  "CS55 R-EV - Modelo 2027",
  "HUNTER E",
  "HUNTER TURBO",
  "M60",
  "Honor S",
  "Startruck",
  "Otro modelo",
] as const;

export type LeadTimeframe = (typeof leadTimeframes)[number]["value"];
export type PaymentMethod = (typeof paymentMethods)[number]["value"];
export type LeadTemperature = "HIGH" | "MEDIUM" | "LOW";
export type LeadStatus = "NUEVO" | "CONTACTADO" | "COTIZADO" | "PERDIDO" | "CERRADO";
export type WhatsappStatus = "PENDING" | "SENT" | "SERVER_ACK" | "DELIVERY_ACK" | "READ" | "PLAYED" | "RECEIVED" | "FAILED";
export type ConversationState = "NEW" | "ACTIVE" | "WAITING_CUSTOMER" | "CLOSED";
export type NextActionType = "CALL" | "WHATSAPP" | "QUOTE" | "OTHER";
export type FollowUpActionStatus = "PENDING" | "DONE" | "POSTPONED" | "IGNORED" | "CANCELED";
export type MessageDirection = "INBOUND" | "OUTBOUND";

export interface FollowUpAction {
  id: string;
  leadId: string;
  actionType: NextActionType;
  scheduledFor: string;
  status: FollowUpActionStatus;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  userId: string | null;
  tenantId: string | null;
  createdAt: string;
  fullName: string;
  phone: string;
  carModel: string;
  carModels: string[];
  timeframe: LeadTimeframe;
  paymentMethod: PaymentMethod;
  tradeInCar: boolean;
  score: number;
  temperature: LeadTemperature;
  notes: string | null;
  whatsappStatus: WhatsappStatus;
  conversationState: ConversationState;
  nextActionAt: string | null;
  nextActionType: NextActionType | null;
  lastActivityAt: string | null;
  lastCustomerMessageAt: string | null;
  lastAgentMessageAt: string | null;
  lastCustomerMessagePreview: string | null;
  lastMessageDirection: MessageDirection | null;
  lastMessagePreview: string | null;
  deletedAt: string | null;
  status: LeadStatus;
  followUpActions: FollowUpAction[];
}

export interface CreateLeadInput {
  fullName: string;
  phone: string;
  carModels: string[];
  timeframe: LeadTimeframe;
  paymentMethod: PaymentMethod;
  tradeInCar: boolean;
  notes?: string;
}

export interface SendLeadInput {
  leadId: string;
  fullName: string;
  phone: string;
  carModels: string[];
}

export interface ScheduleLeadActionInput {
  leadId: string;
  actionType: NextActionType;
  days: number;
  note?: string;
}

export interface UpdateFollowUpActionInput {
  actionId: string;
  status: "DONE" | "POSTPONED" | "IGNORED";
  postponeDays?: number;
  note?: string;
}

export interface LeadScore {
  score: number;
  temperature: LeadTemperature;
}

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  warning?: string;
}

export interface SellerProfile {
  name: string;
  phone: string;
  email: string;
  company: string;
}

export interface WhatsappSendResult {
  leadId: string;
  whatsappStatus: WhatsappStatus;
  persisted: boolean;
  providerMessageId: string | null;
  mediaSent: boolean;
}

export interface LeadMessage {
  id: string;
  leadId: string;
  providerMessageId: string | null;
  direction: MessageDirection;
  status: WhatsappStatus;
  body: string | null;
  phone: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
}

export function getWhatsappStatusLabel(status: WhatsappStatus): string {
  return {
    PENDING: "Pendiente",
    SENT: "Enviado",
    SERVER_ACK: "Enviado a WhatsApp",
    DELIVERY_ACK: "Entregado",
    READ: "Leído",
    PLAYED: "Reproducido",
    RECEIVED: "Recibido",
    FAILED: "Falló",
  }[status];
}

export function getConversationStateLabel(state: ConversationState): string {
  return {
    NEW: "Nuevo",
    ACTIVE: "Conversación activa",
    WAITING_CUSTOMER: "Esperando cliente",
    CLOSED: "Cerrado",
  }[state];
}

export function getNextActionLabel(action: NextActionType): string {
  return { CALL: "Llamar", WHATSAPP: "Escribir por WhatsApp", QUOTE: "Enviar cotización", OTHER: "Otra acción" }[action];
}

export function getFollowUpActionStatusLabel(status: FollowUpActionStatus): string {
  return { PENDING: "Pendiente", DONE: "Hecha", POSTPONED: "Pospuesta", IGNORED: "Ignorada", CANCELED: "Cancelada" }[status];
}

const timeframePoints: Record<LeadTimeframe, number> = {
  INMEDIATA: 40,
  "1_3_MESES": 30,
  "3_6_MESES": 15,
  EXPLORANDO: 5,
};

const paymentPoints: Record<PaymentMethod, number> = {
  CREDITO: 20,
  CONTADO: 15,
  LEASING: 18,
  POR_DEFINIR: 5,
};

export function calculateLeadScore(input: Pick<CreateLeadInput, "carModels" | "timeframe" | "paymentMethod" | "tradeInCar">): LeadScore {
  const modelPoints = input.carModels.length > 0 ? 20 : 0;
  const tradeInPoints = input.tradeInCar ? 20 : 8;
  const score = Math.min(100, modelPoints + timeframePoints[input.timeframe] + paymentPoints[input.paymentMethod] + tradeInPoints);

  return {
    score,
    temperature: score >= 70 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW",
  };
}

export function getTemperatureLabel(temperature: LeadTemperature): string {
  return { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" }[temperature];
}

export function getStatusLabel(status: LeadStatus): string {
  return {
    NUEVO: "Nuevo",
    CONTACTADO: "Contactado",
    COTIZADO: "Cotizado",
    PERDIDO: "Perdido",
    CERRADO: "Cerrado",
  }[status];
}

export function normalizeWhatsappNumber(phone: string): string | null {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, "");
  const hasInternationalPrefix = raw.startsWith("+") || raw.startsWith("00");

  if (raw.startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;

  // Ecuador local format: 0984790449 -> 593984790449.
  if (digits.length === 10 && digits.startsWith("0")) return `593${digits.slice(1)}`;
  // Also accept Ecuador mobile numbers without the leading zero: 984790449.
  if (digits.length === 9 && digits.startsWith("9")) return `593${digits}`;
  // An explicit international prefix means the caller already supplied the country.
  if (hasInternationalPrefix || digits.startsWith("593")) return digits.length >= 8 && digits.length <= 15 ? digits : null;
  // Bare numbers longer than a local Ecuador number are treated as country-coded.
  if (digits.length > 10 && digits.length <= 15) return digits;

  return null;
}

export function getWhatsappPhoneError(phone: string): string | null {
  if (normalizeWhatsappNumber(phone)) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && !digits.startsWith("0")) return "Para un número de otro país escribe el código internacional, por ejemplo +57 315 204 8890.";
  return "Ingresa un celular ecuatoriano de 10 dígitos (por ejemplo 0984790449) o un número internacional con código de país.";
}

export function formatPhoneForWhatsapp(phone: string): string {
  return normalizeWhatsappNumber(phone) ?? phone.replace(/\D/g, "");
}

export function buildWhatsAppMessage(fullName: string, carModel: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] || "cliente";
  return `Hola ${firstName}, soy tu asesor. Gracias por visitarnos; te escribo para seguir con la información de tu ${carModel}.`;
}
