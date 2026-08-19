"use client";

import { LoaderCircle, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { Lead } from "@/lib/domain/lead";
import { retryFirstContactResourceAction, startFirstContactAction } from "@/lib/leads/actions";
import { orderFirstContactItems } from "@/lib/first-contact/order";
import { firstContactResourceLabel, type FirstContactOperationResult, type FirstContactResource, type FirstContactResult } from "@/lib/first-contact/types";

const resultLabel: Record<FirstContactResult, string> = { ACCEPTED: "Aceptado", FAILED: "Falló", UNKNOWN: "Resultado incierto", NOT_AVAILABLE: "No disponible" };
const resultClass: Record<FirstContactResult, string> = { ACCEPTED: "bg-[#eef6d7] text-[#4b6905]", FAILED: "bg-[#fff0ee] text-[#b33a2c]", UNKNOWN: "bg-[#fff8df] text-[#8a5b00]", NOT_AVAILABLE: "bg-[#f1f2f4] text-[var(--muted)]" };

export function FirstContactSummary({ lead, initialOperation }: { lead: Pick<Lead, "id" | "fullName" | "phone" | "carModels">; initialOperation?: FirstContactOperationResult | null }) {
  const [operation, setOperation] = useState(initialOperation ?? null);
  const [isSending, setIsSending] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (isSending || operation) return;
    setIsSending(true); setError(null);
    try {
      const response = await startFirstContactAction({ leadId: lead.id, fullName: lead.fullName, phone: lead.phone, carModels: lead.carModels });
      if (response.success && response.data) setOperation(response.data); else setError(response.error || "No pudimos iniciar el primer contacto.");
    } catch {
      setError("No pudimos iniciar el primer contacto. Intenta de nuevo.");
    } finally {
      setIsSending(false);
    }
  }

  async function retry(item: FirstContactOperationResult["items"][number]) {
    if (!item.effectId || item.result !== "FAILED" || retrying) return;
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

  return <section className="mt-2 rounded-xl border border-[#dce5ef] bg-[#f8fbff] p-2" aria-label="Resumen del primer contacto">
    <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Primer contacto</p>{!operation ? <button type="button" disabled={isSending} onClick={() => void start()} className="button-primary min-h-9 px-3 py-1.5 text-[11px]">{isSending ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}<span>{isSending ? "Preparando…" : "Iniciar"}</span></button> : null}</div>
    {operation ? <div className="mt-1.5 grid grid-cols-3 gap-1">{orderFirstContactItems(operation.items).map((item) => <ResourceResult key={item.id} item={item} retrying={retrying === item.id} onRetry={() => void retry(item)} />)}</div> : null}
    {error ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-red-600" role="alert"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{error}</p> : null}
  </section>;
}

function ResourceResult({ item, retrying, onRetry }: { item: FirstContactOperationResult["items"][number]; retrying: boolean; onRetry: () => void }) {
  const resource = item.resourceKind as FirstContactResource;
  const result = item.result ?? (item.availability === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "UNKNOWN") as FirstContactResult;
  return <div className={`flex min-w-0 flex-col items-center justify-center rounded-lg border border-black/[0.06] bg-white p-2 text-center ${result === "FAILED" ? "min-h-[72px]" : "min-h-[52px]"}`}><div className="flex min-w-0 flex-col items-center gap-1"><p className="text-[9px] font-black leading-3">{firstContactResourceLabel(resource)}</p><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black leading-3 ${resultClass[result]}`}>{resultLabel[result]}</span></div>{result === "FAILED" ? <button type="button" aria-label="Reintentar recurso" title="Reintentar" disabled={retrying} onClick={onRetry} className="mt-1 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-md border border-[#cbd8e8] bg-[#f8fbff] px-2 text-[10px] font-black text-[var(--ink)] transition hover:border-[#9fb5cf] hover:bg-[#eef5ff] disabled:cursor-wait disabled:opacity-60">{retrying ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}<span>{retrying ? "Reintentando…" : "Reintentar"}</span></button> : null}</div>;
}
