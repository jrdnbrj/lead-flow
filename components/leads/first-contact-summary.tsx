"use client";

import { LoaderCircle, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { Lead } from "@/lib/domain/lead";
import { retryFirstContactRecoveryResourceAction, retryFirstContactResourceAction, startFirstContactAction } from "@/lib/leads/actions";
import { orderFirstContactItems } from "@/lib/first-contact/order";
import { firstContactResourceLabel, type FirstContactOperationResult, type FirstContactResource, type FirstContactResult } from "@/lib/first-contact/types";
import { FirstContactColorSelector } from "@/components/leads/first-contact-color-selector";
import type { FirstContactColorSelection } from "@/lib/first-contact/resource-plan";

const resultLabel: Record<FirstContactResult, string> = { ACCEPTED: "Aceptado", FAILED: "Falló", UNKNOWN: "Resultado incierto", NOT_AVAILABLE: "No disponible" };
const resultClass: Record<FirstContactResult | "PENDING", string> = { ACCEPTED: "bg-[#eef6d7] text-[#4b6905]", FAILED: "bg-[#fff0ee] text-[#b33a2c]", UNKNOWN: "bg-[#fff8df] text-[#8a5b00]", NOT_AVAILABLE: "bg-[#f1f2f4] text-[var(--muted)]", PENDING: "bg-[#f1f2f4] text-[var(--muted)]" };

export function FirstContactSummary({ lead, initialOperation }: { lead: Pick<Lead, "id" | "fullName" | "phone" | "carModels"> & Partial<Pick<Lead, "whatsappStatus" | "lastAgentMessageAt" | "lastMessageDirection">>; initialOperation?: FirstContactOperationResult | null }) {
  const [operation, setOperation] = useState(initialOperation ?? null);
  const [isSending, setIsSending] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingRecoveryResource, setRetryingRecoveryResource] = useState<FirstContactResource | null>(null);
  const [isColorSelectorOpen, setIsColorSelectorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recoveryMode = !operation && Boolean(lead.lastAgentMessageAt || lead.lastMessageDirection === "OUTBOUND" || (lead.whatsappStatus && lead.whatsappStatus !== "PENDING"));
  const recoveryMessageStatus = lead.whatsappStatus === "FAILED" ? "Falló" : "No confirmado";

  async function start(colorSelections: FirstContactColorSelection[] = []) {
    if (isSending || operation) return;
    setIsColorSelectorOpen(false);
    setIsSending(true); setError(null);
    try {
      const response = await startFirstContactAction({ leadId: lead.id, fullName: lead.fullName, phone: lead.phone, carModels: lead.carModels, colorSelections });
      if (response.success && response.data) setOperation(response.data); else setError(response.error || "No pudimos iniciar el primer contacto.");
    } catch {
      setError("No pudimos iniciar el primer contacto. Intenta de nuevo.");
    } finally {
      setIsSending(false);
    }
  }

  async function retry(item: FirstContactOperationResult["items"][number]) {
    if (!item.effectId || item.availability !== "AVAILABLE" || (item.result !== null && item.result !== "FAILED" && item.result !== "UNKNOWN") || retrying) return;
    setRetrying(item.id); setError(null);
    try {
      const response = await retryFirstContactResourceAction({ leadId: lead.id, effectId: item.effectId, idempotencyKey: crypto.randomUUID() });
      if (response.success && response.data) setOperation(response.data); else setError(response.error || "No pudimos reintentar el recurso.");
    } catch {
      setError("No pudimos reintentar el recurso. Intenta de nuevo.");
    } finally {
      setRetrying(null);
    }
  }

  async function retryRecoveryResource(resourceKind: FirstContactResource, itemKey?: string) {
    if (retryingRecoveryResource) return;
    setRetryingRecoveryResource(resourceKind); setError(null);
    try {
      const response = await retryFirstContactRecoveryResourceAction({ leadId: lead.id, resourceKind, itemKey, idempotencyKey: crypto.randomUUID() });
      if (response.success && response.data) setOperation(response.data); else setError(response.error || "No pudimos reintentar el recurso.");
    } catch {
      setError("No pudimos reintentar el recurso. Puedes intentarlo de nuevo.");
    } finally {
      setRetryingRecoveryResource(null);
    }
  }

  async function retryItem(item: FirstContactOperationResult["items"][number]) {
    if (item.availability === "NOT_AVAILABLE" && item.resourceKind !== "MESSAGE") {
      await retryRecoveryResource(item.resourceKind, item.itemKey);
      return;
    }
    await retry(item);
  }

  return <section className="mt-2 rounded-xl border border-[#dce5ef] bg-[#f8fbff] p-2" aria-label="Resumen del primer contacto">
    <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Primer contacto</p>{!operation && !recoveryMode ? <button type="button" disabled={isSending} onClick={() => setIsColorSelectorOpen(true)} className="button-primary min-h-9 px-3 py-1.5 text-[11px]">{isSending ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}<span>{isSending ? "Preparando…" : "Iniciar"}</span></button> : null}</div>
    {recoveryMode ? <><div className="mt-1.5 grid grid-cols-3 gap-1"><RecoveryResource label="Mensaje" status={recoveryMessageStatus} retrying={retryingRecoveryResource === "MESSAGE"} disabled={Boolean(retryingRecoveryResource)} onRetry={() => void retryRecoveryResource("MESSAGE")} /><RecoveryResource label="Fotos" status="No confirmado" retrying={retryingRecoveryResource === "PHOTOS"} disabled={Boolean(retryingRecoveryResource)} onRetry={() => void retryRecoveryResource("PHOTOS")} /><RecoveryResource label="Ficha técnica" status="No confirmado" retrying={retryingRecoveryResource === "TECHNICAL_SHEET"} disabled={Boolean(retryingRecoveryResource)} onRetry={() => void retryRecoveryResource("TECHNICAL_SHEET")} /></div><p className="mt-1.5 text-[10px] leading-4 text-[var(--muted)]">Hay evidencia de un intento, pero falta el detalle del primer contacto. Puedes reintentar cada recurso por separado o usar el botón de la card para intentar todo.</p></> : null}
    {operation ? <div className="mt-1.5 grid grid-cols-3 gap-1">{orderFirstContactItems(operation.items).map((item) => <ResourceResult key={item.id} item={item} leadModels={lead.carModels} retrying={retrying === item.id || (item.availability === "NOT_AVAILABLE" && retryingRecoveryResource === item.resourceKind)} onRetry={() => void retryItem(item)} />)}</div> : null}
    {error ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-red-600" role="alert"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{error}</p> : null}
    {isColorSelectorOpen ? <FirstContactColorSelector lead={lead} open onCancel={() => setIsColorSelectorOpen(false)} onConfirm={(colorSelections) => void start(colorSelections)} /> : null}
  </section>;
}

function RecoveryResource({ label, status, retrying, disabled, onRetry }: { label: string; status: string; retrying: boolean; disabled: boolean; onRetry: () => void }) {
  return <div className="flex min-h-[64px] min-w-0 flex-col items-center justify-center rounded-lg border border-black/[0.06] bg-white p-1.5 text-center"><p className="text-[9px] font-black leading-3">{label}</p><span className="mt-1 rounded-full bg-[#fff8df] px-1.5 py-0.5 text-[9px] font-black leading-3 text-[#8a5b00]">{status}</span><button type="button" aria-label={`Reintentar ${label.toLowerCase()}`} title={`Reintentar ${label.toLowerCase()}`} disabled={disabled} aria-busy={retrying} onClick={onRetry} className="button-primary first-contact-retry mt-1 inline-flex min-h-7 w-full items-center justify-center gap-1 rounded-md px-1 py-0.5 text-[8px] disabled:cursor-wait disabled:opacity-60">{retrying ? <LoaderCircle size={11} className="animate-spin" /> : <RefreshCw size={11} />}<span>{retrying ? "Reintentando…" : "Reintentar"}</span></button></div>;
}

function ResourceResult({ item, leadModels, retrying, onRetry }: { item: FirstContactOperationResult["items"][number]; leadModels: string[]; retrying: boolean; onRetry: () => void }) {
  const resource = item.resourceKind as FirstContactResource;
  const result = item.result ?? (item.availability === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "PENDING") as FirstContactResult | "PENDING";
  const retryable = (item.availability === "AVAILABLE" && (item.result === null || item.result === "FAILED" || item.result === "UNKNOWN")) || (resource !== "MESSAGE" && item.availability === "NOT_AVAILABLE" && item.result === "NOT_AVAILABLE");
  const label = firstContactItemLabel(resource, item.itemKey, leadModels, item.selectedColorName);
  return <div className={`flex min-w-0 flex-col items-center justify-center rounded-lg border border-black/[0.06] bg-white p-2 text-center ${retryable ? "min-h-[64px]" : "min-h-[52px]"}`}><div className="flex min-w-0 flex-col items-center gap-1"><p className="text-[9px] font-black leading-3">{label}</p><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black leading-3 ${resultClass[result]}`}>{result === "PENDING" ? "No enviado" : result === "NOT_AVAILABLE" ? "No disponible aún" : resultLabel[result]}</span></div>{retryable ? <button type="button" aria-label={`Reintentar ${label.toLowerCase()}`} title={`Reintentar ${label.toLowerCase()}`} disabled={retrying} aria-busy={retrying} onClick={onRetry} className="button-primary first-contact-retry mt-1 inline-flex min-h-7 w-full items-center justify-center gap-1 rounded-md px-1 py-0.5 text-[8px] disabled:cursor-wait disabled:opacity-60">{retrying ? <LoaderCircle size={11} className="animate-spin" /> : <RefreshCw size={11} />}<span>{retrying ? "Buscando…" : "Reintentar"}</span></button> : null}</div>;
}

function firstContactItemLabel(resource: FirstContactResource, itemKey: string, leadModels: string[], selectedColorName?: string | null): string {
  const baseLabel = firstContactResourceLabel(resource);
  if (resource === "MESSAGE") return baseLabel;
  const scopedModel = itemKey.match(/^(?:PHOTO|TECHNICAL_SHEET):(\d{2}):/);
  const modelIndex = scopedModel ? Number(scopedModel[1]) - 1 : 0;
  const modelName = leadModels[modelIndex];
  const resourceLabel = resource === "PHOTOS" ? "Foto" : "Ficha técnica";
  const colorLabel = resource === "PHOTOS" && selectedColorName ? ` · ${selectedColorName}` : "";
  return modelName ? `${resourceLabel} — ${modelName}${colorLabel}` : `${resourceLabel}${colorLabel}`;
}
