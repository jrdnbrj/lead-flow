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
  "Mazda CX-30",
  "Mazda 3",
  "Toyota Corolla Cross",
  "Renault Duster",
  "Otro modelo",
] as const;

export type LeadTimeframe = (typeof leadTimeframes)[number]["value"];
export type PaymentMethod = (typeof paymentMethods)[number]["value"];
export type LeadTemperature = "HIGH" | "MEDIUM" | "LOW";
export type LeadStatus = "NUEVO" | "CONTACTADO" | "COTIZADO" | "PERDIDO" | "CERRADO";
export type WhatsappStatus = "PENDING" | "SENT" | "FAILED";

export interface Lead {
  id: string;
  userId: string | null;
  tenantId: string | null;
  createdAt: string;
  fullName: string;
  phone: string;
  carModel: string;
  timeframe: LeadTimeframe;
  paymentMethod: PaymentMethod;
  tradeInCar: boolean;
  score: number;
  temperature: LeadTemperature;
  notes: string | null;
  whatsappStatus: WhatsappStatus;
  status: LeadStatus;
}

export interface CreateLeadInput {
  fullName: string;
  phone: string;
  carModel: string;
  timeframe: LeadTimeframe;
  paymentMethod: PaymentMethod;
  tradeInCar: boolean;
  notes?: string;
}

export interface LeadScore {
  score: number;
  temperature: LeadTemperature;
}

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
}

export interface SellerProfile {
  name: string;
  phone: string;
  email: string;
  company: string;
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

export function calculateLeadScore(input: Pick<CreateLeadInput, "carModel" | "timeframe" | "paymentMethod" | "tradeInCar">): LeadScore {
  const modelPoints = input.carModel.trim() ? 20 : 0;
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

export function formatPhoneForWhatsapp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("57") ? digits : `57${digits}`;
}
