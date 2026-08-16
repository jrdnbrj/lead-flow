import { z } from "zod";

export const sendLeadSchema = z.object({
  leadId: z.string().trim().min(1),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[0-9+\s()-]{7,20}$/, "El celular no es válido"),
  carModels: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
});

export const firstContactRetrySchema = z.object({
  leadId: z.string().trim().min(1),
  effectId: z.string().trim().min(1),
  expectedEffectVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export const scheduleLeadActionSchema = z.object({
  leadId: z.string().trim().min(1),
  actionType: z.enum(["CALL", "WHATSAPP", "QUOTE", "OTHER"]),
  days: z.number().int().min(1).max(365).optional(),
  shortcut: z.enum(["POSTPONE_PLUS_ONE_HOUR", "POSTPONE_LATER", "POSTPONE_TOMORROW", "POSTPONE_IN_THREE_DAYS"]).optional(),
  scheduledFor: z.string().datetime().optional(),
  note: z.string().trim().max(240, "La nota no puede superar 240 caracteres").optional(),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
}).superRefine((value, context) => {
  if (!value.days && !value.shortcut && !value.scheduledFor) context.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Indica cuándo programar la acción." });
});

export const updateFollowUpActionSchema = z.object({
  actionId: z.string().trim().min(1),
  status: z.enum(["DONE", "POSTPONED", "IGNORED", "CANCELED"]),
  postponeDays: z.number().int().min(1).max(365).optional(),
  shortcut: z.enum(["POSTPONE_PLUS_ONE_HOUR", "POSTPONE_LATER", "POSTPONE_TOMORROW", "POSTPONE_IN_THREE_DAYS"]).optional(),
  note: z.string().trim().max(240).optional(),
  expectedActionVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
}).superRefine((value, context) => {
  if (value.status === "POSTPONED" && !value.postponeDays && !value.shortcut) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["postponeDays"], message: "Indica cuándo reprogramar la acción." });
  }
});

export const correctInboundResponseSchema = z.object({
  leadId: z.string().trim().min(1),
  decision: z.enum(["REQUIRES_RESPONSE", "NO_RESPONSE_REQUIRED"]),
  sourceMessageId: z.string().trim().min(1).optional(),
  actionId: z.string().trim().min(1).optional(),
  expectedActionVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
}).superRefine((value, context) => {
  if (value.decision === "REQUIRES_RESPONSE" && !value.sourceMessageId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceMessageId"], message: "El mensaje inbound es requerido." });
  if (value.decision === "NO_RESPONSE_REQUIRED" && !value.expectedActionVersion) context.addIssue({ code: z.ZodIssueCode.custom, path: ["expectedActionVersion"], message: "La versión de la acción es requerida." });
});

export const purchaseDecisionSchema = z.object({
  leadId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
});

export const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe el nombre del prospecto").max(100),
  phone: z.string().trim().regex(/^[0-9+\s()-]{7,20}$/, "Ingresa un celular válido"),
  carModels: z.array(z.string().trim().min(2).max(100)).min(1, "Selecciona al menos un modelo").max(10, "Puedes seleccionar hasta 10 modelos"),
  timeframe: z.enum(["INMEDIATA", "1_3_MESES", "3_6_MESES", "EXPLORANDO"]),
  paymentMethod: z.enum(["CREDITO", "CONTADO", "LEASING", "POR_DEFINIR"]),
  tradeInCar: z.boolean(),
  notes: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

export type LeadFormValues = z.infer<typeof leadSchema>;
