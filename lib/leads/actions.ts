"use server";

import type { ActionResponse, ConversationState, CreateLeadInput, FollowUpAction, Lead, ScheduleLeadActionInput, SendLeadInput, UpdateFollowUpActionInput, WhatsappSendResult } from "@/lib/domain/lead";
import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { renderWhatsappMessageTemplate } from "@/lib/config/message-template-shared";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { getStartOfSellerDayAfter } from "@/lib/leads/follow-up";
import { clearLeadAction, createLead, createLeadMessage, getLeadById, markLeadAfterOutboundMessage, scheduleLeadAction, softDeleteLead, updateFollowUpAction, updateLeadConversationState, updateLeadMessage } from "@/lib/leads/repository";
import { leadSchema, scheduleLeadActionSchema, sendLeadSchema, updateFollowUpActionSchema } from "@/lib/leads/validation";
import { ensureEvolutionWebhook, sendWhatsappText } from "@/lib/whatsapp/service";
import { hasSupabaseConfig } from "@/lib/supabase/server";

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

  let messageRowId: string | null = null;
  try {
    const storedLead = await getLeadById(parsed.data.leadId);
    if (hasSupabaseConfig() && !storedLead) return { success: false, error: "No encontramos este lead en Supabase; actualiza el dashboard e inténtalo nuevamente." };
    const target = storedLead ?? parsed.data;
    const template = await getEffectiveWhatsappMessageTemplate();
    const seller = await getEffectiveSellerProfile();
    const text = renderWhatsappMessageTemplate(template, {
      nombre: target.fullName.trim().split(/\s+/)[0] || "cliente",
      numero: target.phone,
      carro: target.carModel,
      nombre_vendedor: seller.name,
      correo_vendedor: seller.email,
      empresa_vendedor: seller.company,
      numero_vendedor: seller.phone,
    });
    messageRowId = await createLeadMessage({ leadId: parsed.data.leadId, direction: "OUTBOUND", status: "PENDING", body: text, phone: target.phone });
    let webhookConfigured = false;
    try {
      webhookConfigured = await ensureEvolutionWebhook();
    } catch {
      webhookConfigured = false;
    }
    const result = await sendWhatsappText({ phone: target.phone, text });
    const persisted = await markLeadAfterOutboundMessage(parsed.data.leadId, result.status, undefined);
    if (messageRowId) {
      await updateLeadMessage(messageRowId, { providerMessageId: result.providerMessageId, status: result.status, rawPayload: result.payload });
    }
    return {
      success: true,
      data: { leadId: parsed.data.leadId, whatsappStatus: result.status, persisted, providerMessageId: result.providerMessageId },
      warning: !webhookConfigured ? "Mensaje enviado. Evolution no tiene webhook configurado; los estados posteriores no se sincronizarán todavía." : persisted ? undefined : "Mensaje enviado; el lead no confirmó la persistencia en Supabase.",
    };
  } catch (error) {
    await markLeadAfterOutboundMessage(parsed.data.leadId, "FAILED", error instanceof Error ? error.message : "Evolution API error");
    if (messageRowId) await updateLeadMessage(messageRowId, { status: "FAILED", failedAt: new Date().toISOString() });
    const message = error instanceof Error ? error.message : "No fue posible enviar el mensaje por WhatsApp.";
    return { success: false, error: message };
  }
}

export async function scheduleLeadActionAction(input: ScheduleLeadActionInput): Promise<ActionResponse<{ action: FollowUpAction; nextActionAt: string; actionType: ScheduleLeadActionInput["actionType"] }>> {
  const parsed = scheduleLeadActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Selecciona una acción y una fecha válida." };

  const nextActionAt = getStartOfSellerDayAfter(parsed.data.days);
  const persisted = await scheduleLeadAction(parsed.data.leadId, parsed.data.actionType, nextActionAt, parsed.data.note);
  const action = persisted ?? {
    id: crypto.randomUUID(),
    leadId: parsed.data.leadId,
    actionType: parsed.data.actionType,
    scheduledFor: nextActionAt,
    status: "PENDING" as const,
    note: parsed.data.note?.trim() || null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return {
    success: true,
    data: { action, nextActionAt, actionType: parsed.data.actionType },
    warning: persisted ? undefined : "El recordatorio se calculó, pero Supabase no confirmó el guardado.",
  };
}

export async function updateFollowUpActionAction(input: UpdateFollowUpActionInput): Promise<ActionResponse<{ action: FollowUpAction }>> {
  const parsed = updateFollowUpActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "No pudimos actualizar ese recordatorio. Revisa la fecha." };

  const scheduledFor = parsed.data.status === "POSTPONED" ? getStartOfSellerDayAfter(parsed.data.postponeDays ?? 1) : undefined;
  const action = await updateFollowUpAction(parsed.data.actionId, parsed.data.status, scheduledFor, parsed.data.note);
  return action
    ? { success: true, data: { action } }
    : { success: false, error: "No pudimos actualizar ese recordatorio en Supabase." };
}

export async function clearLeadActionAction(leadId: string): Promise<ActionResponse<{ leadId: string }>> {
  const persisted = await clearLeadAction(leadId);
  return { success: persisted, data: persisted ? { leadId } : undefined, error: persisted ? undefined : "No pudimos actualizar el seguimiento." };
}

export async function updateLeadConversationAction(input: { leadId: string; state: ConversationState }): Promise<ActionResponse<{ leadId: string; state: ConversationState }>> {
  if (!input.leadId || !["NEW", "ACTIVE", "WAITING_CUSTOMER", "CLOSED"].includes(input.state)) {
    return { success: false, error: "El estado de la conversación no es válido." };
  }
  const persisted = await updateLeadConversationState(input.leadId, input.state);
  return { success: persisted, data: persisted ? input : undefined, error: persisted ? undefined : "No pudimos actualizar la conversación." };
}

export async function deleteLeadAction(leadId: string): Promise<ActionResponse<{ leadId: string }>> {
  if (!leadId) return { success: false, error: "No encontramos el contacto que quieres eliminar." };
  if (!hasSupabaseConfig()) return { success: true, data: { leadId }, warning: "El contacto se ocultó en este dispositivo." };
  const persisted = await softDeleteLead(leadId);
  return persisted
    ? { success: true, data: { leadId } }
    : { success: false, error: "No pudimos eliminar este contacto. Actualiza la lista e inténtalo nuevamente." };
}
