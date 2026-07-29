import { z } from "zod";

export const sendLeadSchema = z.object({
  leadId: z.string().trim().min(1),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[0-9+\s()-]{7,20}$/, "El celular no es válido"),
  carModel: z.string().trim().min(2).max(100),
});

export const scheduleLeadActionSchema = z.object({
  leadId: z.string().trim().min(1),
  actionType: z.enum(["CALL", "WHATSAPP", "QUOTE", "OTHER"]),
  days: z.number().int().min(1).max(365),
  note: z.string().trim().max(240, "La nota no puede superar 240 caracteres").optional(),
});

export const updateFollowUpActionSchema = z.object({
  actionId: z.string().trim().min(1),
  status: z.enum(["DONE", "POSTPONED", "IGNORED"]),
  postponeDays: z.number().int().min(1).max(365).optional(),
  note: z.string().trim().max(240).optional(),
}).superRefine((value, context) => {
  if (value.status === "POSTPONED" && !value.postponeDays) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["postponeDays"], message: "Indica cuándo reprogramar la acción." });
  }
});

export const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe el nombre del prospecto").max(100),
  phone: z.string().trim().regex(/^[0-9+\s()-]{7,20}$/, "Ingresa un celular válido"),
  carModel: z.string().trim().min(2, "Selecciona un modelo").max(100),
  timeframe: z.enum(["INMEDIATA", "1_3_MESES", "3_6_MESES", "EXPLORANDO"]),
  paymentMethod: z.enum(["CREDITO", "CONTADO", "LEASING", "POR_DEFINIR"]),
  tradeInCar: z.boolean(),
  notes: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

export type LeadFormValues = z.infer<typeof leadSchema>;
