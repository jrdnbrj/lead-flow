"use server";

import type { ActionResponse, CreateLeadInput, Lead, SendLeadInput, WhatsappSendResult } from "@/lib/domain/lead";
import { buildWhatsAppMessage } from "@/lib/domain/lead";
import { createLead, getLeadById, updateLeadWhatsappStatus } from "@/lib/leads/repository";
import { leadSchema, sendLeadSchema } from "@/lib/leads/validation";
import { sendWhatsappText } from "@/lib/whatsapp/service";

export async function createLeadAction(input: CreateLeadInput): Promise<ActionResponse<Lead>> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Revisa los datos del prospecto antes de guardar." };
  }

  try {
    const result = await createLead(parsed.data);
    return { success: true, data: result.lead, warning: result.warning };
  } catch {
    return { success: false, error: "No pudimos guardar el lead. Intenta nuevamente." };
  }
}

export async function sendLeadWhatsappAction(input: SendLeadInput): Promise<ActionResponse<WhatsappSendResult>> {
  const parsed = sendLeadSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Los datos del cliente no son válidos para enviar el mensaje." };

  try {
    const storedLead = await getLeadById(parsed.data.leadId);
    const target = storedLead ?? parsed.data;
    await sendWhatsappText({ phone: target.phone, text: buildWhatsAppMessage(target.fullName, target.carModel) });
    const persisted = await updateLeadWhatsappStatus(parsed.data.leadId, "SENT");
    return {
      success: true,
      data: { leadId: parsed.data.leadId, whatsappStatus: "SENT", persisted },
      warning: persisted ? undefined : "Mensaje enviado; el estado se actualizará cuando Supabase esté disponible.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible enviar el mensaje por WhatsApp.";
    return { success: false, error: message };
  }
}
