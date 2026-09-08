"use server";

import { z } from "zod";

import { authRequiredResult } from "@/lib/auth/auth-required";
import { requireAdvisor } from "@/lib/auth/advisor";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { calculateCardQuote, parseCardAmount, validateCardQuote } from "@/lib/financial/card-quote";
import { createCardQuoteSnapshot, quoteSnapshotsEquivalent } from "@/lib/quotes/snapshot";
import { buildQuoteSendIdempotencyKey, executeQuoteSendAttempt, QuoteProviderRejectedError } from "@/lib/quotes/send";
import { beginQuoteFileSendIo, claimQuoteFileSend, createQuotePdfSignedUrl, downloadVehiclePhoto, getActiveCatalogModel, getOwnedLeadForQuote, getQuoteFileForAdvisor, insertQuoteFile, listQuoteFilesForLead, quoteFileToGeneratedFile, recordQuoteFileSendResult, removeQuotePdf, uploadQuotePdf } from "@/lib/quotes/repository";
import type { CardQuotePdfInput, GeneratedQuoteFile, PreparedQuoteForSend, QuoteFileSummary, QuoteSendActionData } from "@/lib/quotes/types";
import { renderCardQuotePdf } from "@/lib/quotes/pdf";
import type { ActionResponse } from "@/lib/domain/lead";
import { createLeadMessage } from "@/lib/leads/repository";
import { getWhatsappPhoneError, normalizeWhatsappNumber } from "@/lib/domain/lead";
import { EvolutionProviderRejectedError, getCustomerEvolutionInstanceName, hasCustomerEvolutionConfig, sendWhatsappDocument } from "@/lib/whatsapp/service";
import { createHash } from "node:crypto";

const cardQuotePdfSchema = z.object({
  leadId: z.string().trim().uuid(),
  modelId: z.string().trim().min(1).max(100),
  amount: z.string().trim().min(1).max(40),
  modality: z.string().trim().min(1).max(30),
  term: z.number().int().positive().nullable(),
});

const quoteHistorySchema = z.object({ leadId: z.string().trim().uuid() });
const cardQuoteSendSchema = cardQuotePdfSchema.extend({ generatedQuoteFileId: z.string().trim().uuid().nullable().optional() });

function safeFileSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("es-EC")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 70) || "vehiculo";
}

function logQuoteFailure(action: string, error: unknown): void {
  console.error("[leadflow][quotes] action failed", { action, message: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
}

type CurrentQuoteContext = {
  lead: { id: string; full_name: string; phone: string };
  model: NonNullable<Awaited<ReturnType<typeof getActiveCatalogModel>>>;
  quote: NonNullable<ReturnType<typeof calculateCardQuote>>;
  snapshot: ReturnType<typeof createCardQuoteSnapshot>;
};

async function resolveCurrentQuoteContext(advisorUserId: string, input: CardQuotePdfInput): Promise<{ context: CurrentQuoteContext } | { error: string }> {
  const [lead, model] = await Promise.all([
    getOwnedLeadForQuote(advisorUserId, input.leadId),
    getActiveCatalogModel(input.modelId),
  ]);
  if (!lead) return { error: "No encontramos ese cliente para generar la cotización." };
  if (!model) return { error: "Selecciona un modelo válido del catálogo." };

  const amount = parseCardAmount(input.amount);
  const validation = validateCardQuote({ modality: input.modality, term: input.term, amount });
  if (!validation.valid) return { error: validation.message };
  const quote = calculateCardQuote(validation.input);
  if (!quote) return { error: "No pudimos calcular esta cotización." };

  const sellerProfile = await getEffectiveSellerProfile();
  return {
    context: {
      lead: { id: lead.id, full_name: lead.full_name, phone: lead.phone },
      model,
      quote,
      snapshot: createCardQuoteSnapshot({
        leadId: lead.id,
        clientName: lead.full_name,
        clientPhone: lead.phone,
        modelId: model.id,
        modelName: model.name,
        quote,
        sellerName: sellerProfile.name,
        sellerPhone: sellerProfile.phone,
        sellerEmail: sellerProfile.email,
        sellerCompany: sellerProfile.company,
      }),
    },
  };
}

async function persistQuoteFile(advisorUserId: string, context: CurrentQuoteContext): Promise<GeneratedQuoteFile> {
  const quoteFileId = crypto.randomUUID();
  const dateSlug = context.snapshot.documentDate.slice(0, 10);
  const fileName = `cotizacion-${safeFileSlug(context.model.name)}-${dateSlug}.pdf`;
  const storagePath = `${context.lead.id}/${quoteFileId}.pdf`;
  const photoBytes = context.model.photoStoragePath ? await downloadVehiclePhoto(context.model.photoStoragePath) : null;
  const bytes = await renderCardQuotePdf(context.snapshot, photoBytes, context.model.photoMimeType);
  if (bytes.length === 0) throw new Error("QUOTE_PDF_EMPTY");

  await uploadQuotePdf(storagePath, bytes);
  let row;
  try {
    row = await insertQuoteFile({ id: quoteFileId, leadId: context.lead.id, generatedBy: advisorUserId, modelId: context.model.id, modelName: context.model.name, storagePath, fileName, snapshot: context.snapshot });
  } catch (error) {
    await removeQuotePdf(storagePath);
    throw error;
  }
  return quoteFileToGeneratedFile(row);
}

function claimTokenDigest(): string {
  return createHash("sha256").update(`${crypto.randomUUID()}:${crypto.randomUUID()}`).digest("hex");
}

function quoteSendCaption(clientName: string): string {
  const firstName = clientName.trim().split(/\s+/)[0] || "cliente";
  return `Hola ${firstName}, te comparto la cotización que revisamos. Si deseas, podemos ajustar monto o plazo.`;
}

function quoteSendTimeoutMs(): number {
  const configured = Number(process.env.QUOTE_SEND_TIMEOUT_MS ?? "15000");
  return Number.isFinite(configured) && configured >= 3000 && configured <= 30000 ? Math.round(configured) : 15000;
}

function quoteFileWithSendStatus(file: GeneratedQuoteFile, status: "ACCEPTED" | "FAILED" | "UNKNOWN", completedAt: string | null): GeneratedQuoteFile {
  return { ...file, sendStatus: status, sentAt: status === "ACCEPTED" ? completedAt : null };
}

export async function generateCardQuotePdfAction(input: CardQuotePdfInput): Promise<ActionResponse<GeneratedQuoteFile>> {
  const parsed = cardQuotePdfSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Completa el cliente, el modelo y una cotización válida." };

  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  try {
    const resolved = await resolveCurrentQuoteContext(authorization.advisorUserId, parsed.data);
    if ("error" in resolved) return { success: false, error: resolved.error };
    return { success: true, data: await persistQuoteFile(authorization.advisorUserId, resolved.context), message: "Cotización generada." };
  } catch (error) {
    logQuoteFailure("generateCardQuotePdf", error);
    return { success: false, error: "No pudimos generar la cotización. Intenta de nuevo y avísame si continúa." };
  }
}

export async function prepareCardQuoteSendAction(input: CardQuotePdfInput & { generatedQuoteFileId?: string | null }): Promise<ActionResponse<PreparedQuoteForSend>> {
  const parsed = cardQuoteSendSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Completa el cliente, el modelo y una cotización válida." };

  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  try {
    const resolved = await resolveCurrentQuoteContext(authorization.advisorUserId, parsed.data);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const phoneError = getWhatsappPhoneError(resolved.context.lead.phone);
    if (phoneError) return { success: false, error: phoneError };

    let quoteFile: GeneratedQuoteFile | null = null;
    if (parsed.data.generatedQuoteFileId) {
      const existing = await getQuoteFileForAdvisor(authorization.advisorUserId, parsed.data.generatedQuoteFileId);
      if (existing && quoteSnapshotsEquivalent(existing.snapshot as typeof resolved.context.snapshot, resolved.context.snapshot)) quoteFile = quoteFileToGeneratedFile(existing);
    }
    if (!quoteFile) quoteFile = await persistQuoteFile(authorization.advisorUserId, resolved.context);

    return {
      success: true,
      data: { quoteFile, clientName: resolved.context.lead.full_name, clientPhone: resolved.context.lead.phone, modelName: resolved.context.model.name },
      message: "Cotización lista para enviar.",
    };
  } catch (error) {
    logQuoteFailure("prepareCardQuoteSend", error);
    return { success: false, error: "No pudimos preparar la cotización para enviar. Intenta de nuevo." };
  }
}

export async function sendCardQuoteAction(input: CardQuotePdfInput & { preparedQuoteFileId: string }): Promise<ActionResponse<QuoteSendActionData>> {
  const parsed = cardQuoteSendSchema.extend({ preparedQuoteFileId: z.string().trim().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "La confirmación de la cotización ya no es válida. Revísala y vuelve a intentarlo." };

  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  let claim: Awaited<ReturnType<typeof claimQuoteFileSend>> = null;
  let claimToken = "";
  try {
    if (!hasCustomerEvolutionConfig()) return { success: false, error: "La conexión de WhatsApp de clientes no está disponible." };
    const evolutionInstance = getCustomerEvolutionInstanceName();
    if (!evolutionInstance) return { success: false, error: "La conexión de WhatsApp de clientes no está configurada." };

    const resolved = await resolveCurrentQuoteContext(authorization.advisorUserId, parsed.data);
    if ("error" in resolved) return { success: false, error: resolved.error };
    const phoneError = getWhatsappPhoneError(resolved.context.lead.phone);
    if (phoneError) return { success: false, error: phoneError };

    const quoteFileRow = await getQuoteFileForAdvisor(authorization.advisorUserId, parsed.data.preparedQuoteFileId);
    if (!quoteFileRow || quoteFileRow.lead_id !== resolved.context.lead.id || quoteFileRow.model_id !== resolved.context.model.id) {
      return { success: false, error: "No encontramos el PDF preparado. Genera una cotización actualizada." };
    }
    const quoteFile = quoteFileToGeneratedFile(quoteFileRow);
    if (!quoteSnapshotsEquivalent(quoteFile.snapshot, resolved.context.snapshot)) {
      return { success: false, error: "Cambiaste la cotización. Revísala y vuelve a confirmar el envío." };
    }

    const normalizedPhone = normalizeWhatsappNumber(resolved.context.lead.phone);
    if (!normalizedPhone) return { success: false, error: "El número de WhatsApp del cliente no es válido." };
    const idempotencyKey = buildQuoteSendIdempotencyKey(quoteFile.id, normalizedPhone);
    claimToken = claimTokenDigest();
    claim = await claimQuoteFileSend({ quoteFileId: quoteFile.id, leadId: resolved.context.lead.id, generatedBy: authorization.advisorUserId, recipientPhone: normalizedPhone, evolutionInstance, idempotencyKey, claimTokenDigest: claimToken });
    if (!claim) return { success: false, error: "No pudimos reservar el envío de la cotización. Intenta de nuevo." };
    if (claim.claimAction === "REPLAYED") return { success: true, data: { status: "ACCEPTED", quoteFile: quoteFileWithSendStatus(quoteFile, "ACCEPTED", null), providerMessageId: claim.providerMessageId, replayed: true }, message: "La cotización ya estaba enviada; no se duplicó." };
    if (claim.claimAction === "BLOCKED_UNKNOWN") return { success: false, error: "El envío anterior quedó pendiente de confirmación. Verifica WhatsApp antes de intentar otro envío." };
    if (claim.claimAction === "IN_PROGRESS") return { success: false, error: "Este envío ya está en proceso. Espera un momento y actualiza el estado." };

    const latest = await resolveCurrentQuoteContext(authorization.advisorUserId, parsed.data);
    if ("error" in latest || !quoteSnapshotsEquivalent(quoteFile.snapshot, latest.context.snapshot)) {
      await recordQuoteFileSendResult({ sendId: claim.sendId, attemptNo: claim.attemptNo, claimTokenDigest: claimToken, resultKind: "FAILED", errorCode: "FRESHNESS_REJECTED", errorMessage: "La cotización cambió antes del envío." });
      return { success: false, error: "Cambiaste la cotización o los datos del cliente. Revísala y vuelve a confirmar." };
    }

    const documentUrl = await createQuotePdfSignedUrl(quoteFileRow.storage_path);
    if (!documentUrl) {
      await recordQuoteFileSendResult({ sendId: claim.sendId, attemptNo: claim.attemptNo, claimTokenDigest: claimToken, resultKind: "FAILED", errorCode: "SIGNED_URL_FAILED", errorMessage: "No pudimos preparar el PDF privado." });
      return { success: false, error: "No pudimos preparar el PDF para enviar. Intenta de nuevo." };
    }
    if (!await beginQuoteFileSendIo({ sendId: claim.sendId, attemptNo: claim.attemptNo, claimTokenDigest: claimToken })) {
      return { success: false, error: "No pudimos iniciar el envío de forma segura. Intenta de nuevo." };
    }

    const outcome = await executeQuoteSendAttempt({
      send: async () => {
        try {
          const result = await sendWhatsappDocument({ phone: normalizedPhone, documentUrl, caption: quoteSendCaption(latest.context.lead.full_name), fileName: quoteFile.fileName, signal: AbortSignal.timeout(quoteSendTimeoutMs()) });
          return { providerMessageId: result.providerMessageId, status: result.status };
        } catch (error) {
          if (error instanceof EvolutionProviderRejectedError) throw new QuoteProviderRejectedError(error.message, error.code);
          throw error;
        }
      },
    });
    await recordQuoteFileSendResult({ sendId: claim.sendId, attemptNo: claim.attemptNo, claimTokenDigest: claimToken, resultKind: outcome.result, providerMessageId: outcome.providerMessageId, providerStatus: outcome.providerStatus, errorCode: outcome.errorCode ?? (outcome.result === "UNKNOWN" ? "PROVIDER_RESPONSE_UNKNOWN" : null), errorMessage: outcome.result === "ACCEPTED" ? null : outcome.result === "UNKNOWN" ? "No pudimos confirmar la respuesta del proveedor." : "Evolution rechazó el envío.", resultPayload: outcome.providerStatus ? { provider_status: outcome.providerStatus } : null });

    if (outcome.result === "ACCEPTED" && outcome.providerMessageId) {
      const messageBody = quoteSendCaption(latest.context.lead.full_name);
      const messageId = await createLeadMessage({ leadId: latest.context.lead.id, evolutionInstance, providerMessageId: outcome.providerMessageId, direction: "OUTBOUND", status: "SENT", body: messageBody, phone: normalizedPhone });
      if (!messageId) console.error("[leadflow][quotes] outbound quote message audit insert failed", { leadId: latest.context.lead.id });
    }

    const completedAt = new Date().toISOString();
    const responseData: QuoteSendActionData = { status: outcome.result, quoteFile: quoteFileWithSendStatus(quoteFile, outcome.result, completedAt), providerMessageId: outcome.providerMessageId, replayed: false };
    return { success: true, data: responseData, message: outcome.result === "ACCEPTED" ? "Cotización enviada por WhatsApp." : outcome.result === "UNKNOWN" ? "No pudimos confirmar el envío. Verifica WhatsApp antes de intentar otro." : "No pudimos enviar la cotización por WhatsApp." };
  } catch (error) {
    logQuoteFailure("sendCardQuote", error);
    if (claim && claim.claimAction !== "REPLAYED" && claim.claimAction !== "BLOCKED_UNKNOWN" && claim.claimAction !== "IN_PROGRESS") {
      await recordQuoteFileSendResult({ sendId: claim.sendId, attemptNo: claim.attemptNo, claimTokenDigest: claimToken, resultKind: "UNKNOWN", errorCode: "SEND_FLOW_UNKNOWN", errorMessage: "No pudimos confirmar el resultado del envío." });
    }
    return { success: false, error: "No pudimos confirmar el envío de la cotización. Verifica WhatsApp antes de intentar otro." };
  }
}

export async function getQuoteFilesAction(input: { leadId: string }): Promise<ActionResponse<QuoteFileSummary[]>> {
  const parsed = quoteHistorySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "No encontramos el cliente seleccionado." };
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  try {
    const lead = await getOwnedLeadForQuote(authorization.advisorUserId, parsed.data.leadId);
    if (!lead) return { success: false, error: "No encontramos el cliente seleccionado." };
    return { success: true, data: await listQuoteFilesForLead(authorization.advisorUserId, lead.id) };
  } catch (error) {
    logQuoteFailure("getQuoteFiles", error);
    return { success: false, error: "No pudimos cargar las cotizaciones anteriores." };
  }
}
