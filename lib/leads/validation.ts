import { z } from "zod";

export const firstContactColorSelectionSchema = z.object({
  vehicleIndex: z.number().int().min(0).max(2),
  colorId: z.string().trim().min(1).max(100).nullable(),
});

export const sendLeadSchema = z.object({
  leadId: z.string().trim().min(1),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[0-9+\s()-]{7,20}$/, "El celular no es válido"),
  carModels: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
  colorSelections: z.array(firstContactColorSelectionSchema).max(3).optional(),
}).superRefine((value, context) => {
  const indexes = (value.colorSelections ?? []).map((selection) => selection.vehicleIndex);
  if (new Set(indexes).size !== indexes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["colorSelections"], message: "No puedes repetir la selección de un vehículo." });
  if (indexes.some((index) => index >= Math.min(value.carModels.length, 3))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["colorSelections"], message: "La selección de color no corresponde a un vehículo del lead." });
});

export const firstContactRetrySchema = z.object({
  leadId: z.string().trim().min(1),
  effectId: z.string().trim().min(1),
  expectedEffectVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(200),
});

export const firstContactRecoveryRetrySchema = z.object({
  leadId: z.string().trim().min(1),
  resourceKind: z.enum(["MESSAGE", "PHOTOS", "TECHNICAL_SHEET"]),
  itemKey: z.string().trim().min(1).max(240).optional(),
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
  scheduledFor: z.string().datetime().optional(),
  note: z.string().trim().max(240).optional(),
  expectedActionVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
}).superRefine((value, context) => {
  if (value.status === "POSTPONED" && !value.postponeDays && !value.shortcut && !value.scheduledFor) {
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

const optionalNationalId = z.string().trim().max(30, "La cédula no puede superar 30 caracteres").regex(/^[0-9A-Za-z-]*$/, "La cédula no es válida").optional();
const optionalEmail = z.string().trim().max(150, "El correo no puede superar 150 caracteres").email("El correo no es válido").or(z.literal("")).optional();

export const purchaseDecisionSchema = z.object({
  leadId: z.string().trim().min(1),
  nationalId: z.string().trim().min(5, "Ingresa la cédula para confirmar la compra").max(30, "La cédula no puede superar 30 caracteres").regex(/^[0-9A-Za-z-]+$/, "La cédula no es válida"),
  idempotencyKey: z.string().trim().min(16).max(200).optional(),
});

export const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe el nombre del prospecto").max(100),
  phone: z.string().trim().regex(/^[0-9+\s()-]{7,20}$/, "Ingresa un celular válido"),
  nationalId: optionalNationalId,
  email: optionalEmail,
  carModels: z.array(z.string().trim().min(2).max(100)).min(1, "Selecciona al menos un modelo").max(10, "Puedes seleccionar hasta 10 modelos"),
  timeframe: z.enum(["INMEDIATA", "1_3_MESES", "3_6_MESES", "EXPLORANDO"]),
  paymentMethod: z.enum(["CREDITO", "TARJETA_CREDITO", "CONTADO", "LEASING", "POR_DEFINIR"]),
  tradeInCar: z.boolean(),
  notes: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

export const updateLeadSchema = leadSchema.extend({ leadId: z.string().trim().min(1) });

export type LeadFormValues = z.infer<typeof leadSchema>;
