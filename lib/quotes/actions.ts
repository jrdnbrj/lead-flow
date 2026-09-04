"use server";

import { z } from "zod";

import { authRequiredResult } from "@/lib/auth/auth-required";
import { requireAdvisor } from "@/lib/auth/advisor";
import { calculateCardQuote, parseCardAmount, validateCardQuote } from "@/lib/financial/card-quote";
import { createCardQuoteSnapshot } from "@/lib/quotes/snapshot";
import { getActiveCatalogModel, getOwnedLeadForQuote, insertQuoteFile, listQuoteFilesForLead, removeQuotePdf, uploadQuotePdf } from "@/lib/quotes/repository";
import type { CardQuotePdfInput, GeneratedQuoteFile, QuoteFileSummary } from "@/lib/quotes/types";
import { renderCardQuotePdf } from "@/lib/quotes/pdf";
import type { ActionResponse } from "@/lib/domain/lead";

const cardQuotePdfSchema = z.object({
  leadId: z.string().trim().uuid(),
  modelId: z.string().trim().min(1).max(100),
  amount: z.string().trim().min(1).max(40),
  modality: z.string().trim().min(1).max(30),
  term: z.number().int().positive().nullable(),
});

const quoteHistorySchema = z.object({ leadId: z.string().trim().uuid() });

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

function leadHasModel(lead: { car_model: string; car_models: string[] | null }, modelName: string): boolean {
  const names = Array.isArray(lead.car_models) && lead.car_models.length > 0 ? lead.car_models : lead.car_model.split(",");
  return names.some((name) => name.trim() === modelName);
}

export async function generateCardQuotePdfAction(input: CardQuotePdfInput): Promise<ActionResponse<GeneratedQuoteFile>> {
  const parsed = cardQuotePdfSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Completa el cliente, el modelo y una cotización válida." };

  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  try {
    const [lead, model] = await Promise.all([
      getOwnedLeadForQuote(authorization.advisorUserId, parsed.data.leadId),
      getActiveCatalogModel(parsed.data.modelId),
    ]);
    if (!lead) return { success: false, error: "No encontramos ese cliente para generar la cotización." };
    if (!model || !leadHasModel(lead, model.name)) return { success: false, error: "Selecciona un modelo que pertenezca a este cliente." };

    const amount = parseCardAmount(parsed.data.amount);
    const validation = validateCardQuote({ modality: parsed.data.modality, term: parsed.data.term, amount });
    if (!validation.valid) return { success: false, error: validation.message };
    const quote = calculateCardQuote(validation.input);
    if (!quote) return { success: false, error: "No pudimos calcular esta cotización." };

    const snapshot = createCardQuoteSnapshot({
      leadId: lead.id,
      clientName: lead.full_name,
      clientPhone: lead.phone,
      modelId: model.id,
      modelName: model.name,
      quote,
    });
    const quoteFileId = crypto.randomUUID();
    const dateSlug = snapshot.documentDate.slice(0, 10);
    const fileName = `cotizacion-${safeFileSlug(model.name)}-${dateSlug}.pdf`;
    const storagePath = `${lead.id}/${quoteFileId}.pdf`;
    const bytes = await renderCardQuotePdf(snapshot);
    if (bytes.length === 0) return { success: false, error: "No pudimos generar el PDF de la cotización." };

    await uploadQuotePdf(storagePath, bytes);
    let row;
    try {
      row = await insertQuoteFile({ id: quoteFileId, leadId: lead.id, generatedBy: authorization.advisorUserId, modelId: model.id, modelName: model.name, storagePath, fileName, snapshot });
    } catch (error) {
      await removeQuotePdf(storagePath);
      throw error;
    }

    return {
      success: true,
      data: {
        id: row.id,
        fileName: row.file_name,
        quoteType: "TARJETA_CREDITO",
        modelName: row.model_name_snapshot,
        amount: quote.amount,
        modality: quote.modality,
        term: quote.term,
        generatedAt: row.generated_at,
        snapshot,
      },
      message: "Cotización generada.",
    };
  } catch (error) {
    logQuoteFailure("generateCardQuotePdf", error);
    return { success: false, error: "No pudimos generar la cotización. Intenta de nuevo y avísame si continúa." };
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
