"use server";

import type { ActionResponse, ConversationState, CreateLeadInput, ExistingLeadSummary, FollowUpAction, Lead, ScheduleLeadActionInput, SendLeadInput, UpdateFollowUpActionInput, UpdateLeadInput, WhatsappSendResult } from "@/lib/domain/lead";
import { authRequiredResult, isAuthRequiredEnabled } from "@/lib/auth/auth-required";
import { requireAdvisor } from "@/lib/auth/advisor";
import { executeFirstContact, retryFirstContact, retryFirstContactResourceFromRecovery } from "@/lib/first-contact/command";
import { createEvolutionFirstContactProvider } from "@/lib/first-contact/provider";
import type { FirstContactOperationResult } from "@/lib/first-contact/types";
import { getResponseReminderAt, getStartOfSellerDayAfter, resolveScheduleShortcut } from "@/lib/leads/follow-up";
import { clearLeadAction, correctInboundResponseForAdvisor, createLead, deleteCanceledFollowUpAction, findLeadByPhone, getInboundMessageCreatedAtForAdvisor, getLeadById, recordPurchaseDecision, scheduleLeadAction, softDeleteLead, updateFollowUpAction, updateLeadConversationState, updateLeadDetails } from "@/lib/leads/repository";
import { correctInboundResponseSchema, firstContactRecoveryRetrySchema, firstContactRetrySchema, leadSchema, purchaseDecisionSchema, scheduleLeadActionSchema, sendLeadSchema, updateFollowUpActionSchema, updateLeadSchema } from "@/lib/leads/validation";
import { hasSupabaseConfig } from "@/lib/supabase/server";

async function requireAdvisorAction<T>(): Promise<ActionResponse<T> | null> {
  const authorization = await requireAdvisor();
  return authorization.status === "AUTHORIZED" ? null : authRequiredResult();
}

export async function recordPurchaseDecisionAction(input: { leadId: string; nationalId: string; idempotencyKey?: string }): Promise<ActionResponse<{ milestoneId: string; recordedAt: string }>> {
  const parsed = purchaseDecisionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "No encontramos el lead para registrar la decisión." };
  const auth = await requireAdvisorAction<{ milestoneId: string; recordedAt: string }>();
  if (auth) return auth;
  try {
    const result = await recordPurchaseDecision(parsed.data.leadId, parsed.data.nationalId, parsed.data.idempotencyKey ?? crypto.randomUUID());
    if (!result) return { success: false, error: "No pudimos registrar la decisión de compra. Puedes reintentarlo." };
    return { success: true, data: { milestoneId: result.milestone.id, recordedAt: result.milestone.recordedAt }, message: result.replayed ? "La compra ya estaba registrada." : "Compra registrada." };
  } catch {
    return { success: false, error: "No pudimos registrar la decisión de compra. Puedes reintentarlo." };
  }
}

export async function updateLeadDetailsAction(input: UpdateLeadInput): Promise<ActionResponse<Lead>> {
  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Revisa los datos del prospecto antes de guardar." };
  const auth = await requireAdvisorAction<Lead>();
  if (auth) return auth;
  try {
    const lead = await updateLeadDetails(parsed.data);
    return lead ? { success: true, data: lead, message: "Información actualizada." } : { success: false, error: "No pudimos actualizar la información. Puedes reintentarlo." };
  } catch {
    return { success: false, error: "No pudimos actualizar la información. Puedes reintentarlo." };
  }
}

export async function createLeadAction(input: CreateLeadInput): Promise<ActionResponse<Lead>> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Revisa los datos del prospecto antes de guardar." };
  }
  if (isAuthRequiredEnabled()) {
    const auth = await requireAdvisorAction<Lead>();
    if (auth) return auth;
  }

  try {
    const result = await createLead(parsed.data);
    return { success: true, data: result.lead, warning: result.warning };
  } catch {
    return { success: false, error: "No pudimos guardar el lead. Revisa tu conexión e inténtalo de nuevo." };
  }
}

export async function findExistingLeadByPhoneAction(phone: string, excludeLeadId?: string): Promise<ActionResponse<ExistingLeadSummary | null>> {
  if (!phone.trim()) return { success: true, data: null };
  if (isAuthRequiredEnabled()) {
    const auth = await requireAdvisorAction<ExistingLeadSummary | null>();
    if (auth) return auth;
  }
  try {
    return { success: true, data: await findLeadByPhone(phone, excludeLeadId) };
  } catch {
    return { success: false, error: "No pudimos revisar si ya existe un contacto con ese teléfono." };
  }
}

export async function sendLeadWhatsappAction(input: SendLeadInput): Promise<ActionResponse<WhatsappSendResult>> {
  const parsed = sendLeadSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Los datos del cliente no son válidos para enviar el mensaje." };
  const auth = await requireAdvisorAction<WhatsappSendResult>();
  if (auth) return auth;
  try {
    const storedLead = await getLeadById(parsed.data.leadId);
    if (hasSupabaseConfig() && !storedLead) return { success: false, error: "No encontramos este lead. Actualiza el dashboard e inténtalo de nuevo." };
    const target = storedLead ?? { id: parsed.data.leadId, fullName: parsed.data.fullName, phone: parsed.data.phone, carModels: parsed.data.carModels };
    const result = await executeFirstContact(target, createEvolutionFirstContactProvider(), crypto.randomUUID());
    if (!result) return { success: false, error: "No pudimos preparar el primer contacto. Puedes reintentarlo." };
    const messageItem = result.items.find((item) => item.resourceKind === "MESSAGE");
    const photosItem = result.items.find((item) => item.resourceKind === "PHOTOS");
    return {
      success: true,
      data: { leadId: parsed.data.leadId, whatsappStatus: messageItem?.result === "ACCEPTED" ? "SENT" : messageItem?.result === "FAILED" ? "FAILED" : "PENDING", persisted: true, providerMessageId: messageItem?.providerMessageId ?? null, mediaSent: photosItem?.result === "ACCEPTED" },
      warning: result.replayed ? "El mensaje ya estaba enviado; no se duplicó." : undefined,
    };
  } catch {
    return { success: false, error: "No fue posible preparar el primer contacto. Intenta de nuevo y avísame si continúa." };
  }
}

export async function startFirstContactAction(input: SendLeadInput): Promise<ActionResponse<FirstContactOperationResult>> {
  const parsed = sendLeadSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Los datos del cliente no son válidos para iniciar el primer contacto." };
  const auth = await requireAdvisorAction<FirstContactOperationResult>();
  if (auth) return auth;
  try {
    const storedLead = await getLeadById(parsed.data.leadId);
    if (hasSupabaseConfig() && !storedLead) return { success: false, error: "No encontramos este lead para iniciar el primer contacto." };
    const target = storedLead ?? { id: parsed.data.leadId, fullName: parsed.data.fullName, phone: parsed.data.phone, carModels: parsed.data.carModels };
    const result = await executeFirstContact(target, createEvolutionFirstContactProvider(), crypto.randomUUID());
    return result ? { success: true, data: result } : { success: false, error: "No pudimos preparar el primer contacto. Puedes reintentarlo." };
  } catch {
    return { success: false, error: "No pudimos iniciar el primer contacto sin cambiar parcialmente el estado." };
  }
}

export async function retryFirstContactResourceAction(input: { leadId: string; effectId: string; expectedEffectVersion?: number; idempotencyKey: string }): Promise<ActionResponse<FirstContactOperationResult>> {
  const parsed = firstContactRetrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "El reintento no es válido." };
  const auth = await requireAdvisorAction<FirstContactOperationResult>();
  if (auth) return auth;
  try {
    const lead = await getLeadById(parsed.data.leadId);
    if (!lead) return { success: false, error: "No encontramos este lead para reintentar el recurso." };
    const result = await retryFirstContact(lead, parsed.data.effectId, parsed.data.expectedEffectVersion, parsed.data.idempotencyKey, createEvolutionFirstContactProvider());
    if (!result) return { success: false, error: "No pudimos reintentar el recurso. Puedes actualizar e intentarlo nuevamente." };
    return { success: true, data: result, message: "Reintento procesado." };
  } catch {
    return { success: false, error: "No pudimos reintentar el recurso sin cambiar parcialmente el estado." };
  }
}

export async function retryFirstContactRecoveryResourceAction(input: { leadId: string; resourceKind: "MESSAGE" | "PHOTOS" | "TECHNICAL_SHEET"; itemKey?: string; idempotencyKey: string }): Promise<ActionResponse<FirstContactOperationResult>> {
  const parsed = firstContactRecoveryRetrySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "El reintento no es válido." };
  const auth = await requireAdvisorAction<FirstContactOperationResult>();
  if (auth) return auth;
  try {
    const lead = await getLeadById(parsed.data.leadId);
    if (!lead) return { success: false, error: "No encontramos este lead para reintentar el recurso." };
    const result = await retryFirstContactResourceFromRecovery(lead, parsed.data.resourceKind, createEvolutionFirstContactProvider(), parsed.data.idempotencyKey, parsed.data.itemKey);
    if (!result) return { success: false, error: "No pudimos reintentar el recurso. Puedes actualizar e intentarlo nuevamente." };
    return { success: true, data: result, message: "Reintento procesado." };
  } catch {
    return { success: false, error: "No pudimos reintentar el recurso sin cambiar parcialmente el estado." };
  }
}

export async function scheduleLeadActionAction(input: ScheduleLeadActionInput): Promise<ActionResponse<{ action: FollowUpAction; nextActionAt: string; actionType: ScheduleLeadActionInput["actionType"] }>> {
  const parsed = scheduleLeadActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Selecciona una acción y una fecha válida." };
  const auth = await requireAdvisorAction<{ action: FollowUpAction; nextActionAt: string; actionType: ScheduleLeadActionInput["actionType"] }>();
  if (auth) return auth;

  const nextActionAt = parsed.data.scheduledFor ?? (parsed.data.shortcut ? resolveScheduleShortcut(parsed.data.shortcut) : getStartOfSellerDayAfter(parsed.data.days ?? 1));
  const action = await scheduleLeadAction(parsed.data.leadId, parsed.data.actionType, nextActionAt, parsed.data.note, parsed.data.idempotencyKey);
  return action
    ? { success: true, data: { action, nextActionAt, actionType: parsed.data.actionType } }
    : { success: false, error: "No pudimos programar ese recordatorio." };
}

export async function updateFollowUpActionAction(input: UpdateFollowUpActionInput): Promise<ActionResponse<{ action: FollowUpAction }>> {
  const parsed = updateFollowUpActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "No pudimos actualizar ese recordatorio. Revisa la fecha." };
  const auth = await requireAdvisorAction<{ action: FollowUpAction }>();
  if (auth) return auth;

  const scheduledFor = parsed.data.status === "POSTPONED"
    ? parsed.data.scheduledFor ?? (parsed.data.shortcut ? resolveScheduleShortcut(parsed.data.shortcut) : getStartOfSellerDayAfter(parsed.data.postponeDays ?? 1))
    : undefined;
  const action = await updateFollowUpAction(parsed.data.actionId, parsed.data.status, scheduledFor, parsed.data.note, parsed.data.expectedActionVersion, parsed.data.idempotencyKey);
  return action
    ? { success: true, data: { action } }
    : { success: false, error: "No pudimos actualizar ese recordatorio. Intenta de nuevo." };
}

export async function clearLeadActionAction(leadId: string): Promise<ActionResponse<{ leadId: string }>> {
  const auth = await requireAdvisorAction<{ leadId: string }>();
  if (auth) return auth;
  const persisted = await clearLeadAction(leadId);
  return { success: persisted, data: persisted ? { leadId } : undefined, error: persisted ? undefined : "No pudimos actualizar el seguimiento." };
}

export async function deleteCanceledFollowUpActionAction(actionId: string): Promise<ActionResponse<{ actionId: string }>> {
  if (!actionId.trim()) return { success: false, error: "No encontramos esa acción." };
  const auth = await requireAdvisorAction<{ actionId: string }>();
  if (auth) return auth;
  const deleted = await deleteCanceledFollowUpAction(actionId);
  return deleted
    ? { success: true, data: { actionId } }
    : { success: false, error: "No pudimos quitar esa acción. Actualiza e inténtalo de nuevo." };
}

export async function correctInboundResponseAction(input: {
  leadId: string;
  decision: "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED";
  sourceMessageId?: string;
  actionId?: string;
  expectedActionVersion?: number;
  idempotencyKey?: string;
}): Promise<ActionResponse<{ action: FollowUpAction | null; status: string; manualDecision: string }>> {
  const parsed = correctInboundResponseSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "La corrección manual no es válida." };
  const auth = await requireAdvisorAction<{ action: FollowUpAction | null; status: string; manualDecision: string }>();
  if (auth) return auth;

  try {
    let scheduledFor: string | undefined;
    if (parsed.data.decision === "REQUIRES_RESPONSE" && parsed.data.sourceMessageId) {
      const createdAt = await getInboundMessageCreatedAtForAdvisor(parsed.data.sourceMessageId, parsed.data.leadId);
      if (!createdAt) return { success: false, error: "No encontramos el mensaje inbound para corregirlo." };
      scheduledFor = getResponseReminderAt(createdAt);
    }
    const result = await correctInboundResponseForAdvisor({
      ...parsed.data,
      idempotencyKey: parsed.data.idempotencyKey ?? crypto.randomUUID(),
      scheduledFor,
    });
    if (!result) return { success: false, error: "No pudimos aplicar la corrección manual." };
    if (result.status === "STALE_ACTION") return { success: false, data: result, error: "La acción cambió antes de aplicar la corrección. Actualiza el seguimiento." };
    return { success: Boolean(result.action), data: result, error: result.action ? undefined : "No encontramos una acción de respuesta abierta." };
  } catch {
    return { success: false, error: "No pudimos aplicar la corrección manual sin cambiar parcialmente el estado." };
  }
}

export async function updateLeadConversationAction(input: { leadId: string; state: ConversationState }): Promise<ActionResponse<{ leadId: string; state: ConversationState }>> {
  if (!input.leadId || !["NEW", "ACTIVE", "WAITING_CUSTOMER", "CLOSED"].includes(input.state)) {
    return { success: false, error: "El estado de la conversación no es válido." };
  }
  const auth = await requireAdvisorAction<{ leadId: string; state: ConversationState }>();
  if (auth) return auth;
  const persisted = await updateLeadConversationState(input.leadId, input.state);
  return { success: persisted, data: persisted ? input : undefined, error: persisted ? undefined : "No pudimos actualizar la conversación." };
}

export async function deleteLeadAction(leadId: string): Promise<ActionResponse<{ leadId: string }>> {
  if (!leadId) return { success: false, error: "No encontramos el contacto que quieres eliminar." };
  const auth = await requireAdvisorAction<{ leadId: string }>();
  if (auth) return auth;
  if (!hasSupabaseConfig()) return { success: true, data: { leadId }, warning: "El contacto se ocultó en este dispositivo." };
  const persisted = await softDeleteLead(leadId);
  return persisted
    ? { success: true, data: { leadId } }
    : { success: false, error: "No pudimos eliminar el contacto. Revisa tu conexión e inténtalo de nuevo." };
}
