"use client";

import { LoaderCircle, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { Lead } from "@/lib/domain/lead";
import { retryFirstContactResourceAction, startFirstContactAction } from "@/lib/leads/actions";
import { firstContactResourceLabel } from "@/lib/first-contact/command";
import type { FirstContactOperationResult, FirstContactResource, FirstContactResult } from "@/lib/first-contact/types";

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
    const response = await startFirstContactAction({ leadId: lead.id, fullName: lead.fullName, phone: lead.phone, carModels: lead.carModels });
    if (response.success && response.data) setOperation(response.data); else setError(response.error || "No pudimos iniciar el primer contacto.");
    setIsSending(false);
  }

  async function retry(item: FirstContactOperationResult["items"][number]) {
    if (!item.effectId || item.result !== "FAILED" || retrying) return;
    setRetrying(item.id); setError(null);
    const response = await retryFirstContactResourceAction({ leadId: lead.id, effectId: item.effectId, idempotencyKey: crypto.randomUUID() });
    if (response.success && response.data) setOperation(response.data); else setError(response.error || "No pudimos reintentar el recurso.");
    setRetrying(null);
  }

  return <section className="mt-3 rounded-2xl border border-[#dce5ef] bg-[#f8fbff] p-3" aria-label="Resumen del primer contacto">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Primer contacto</p><h3 className="mt-1 text-sm font-black">{operation ? "Resultados guardados" : "Aún no iniciado"}</h3></div>{!operation ? <button type="button" disabled={isSending} onClick={() => void start()} className="button-primary min-h-9 px-3 py-2 text-[11px]">{isSending ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}<span>{isSending ? "Preparando…" : "Iniciar"}</span></button> : null}</div>
    {operation ? <div className="mt-3 grid gap-2 sm:grid-cols-3">{operation.items.map((item) => <ResourceResult key={item.id} item={item} retrying={retrying === item.id} onRetry={() => void retry(item)} />)}</div> : <p className="mt-1 text-xs text-[var(--muted)]">Mensaje, fotos y ficha técnica se muestran por separado.</p>}
    {error ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-red-600" role="alert"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{error}</p> : null}
  </section>;
}

function ResourceResult({ item, retrying, onRetry }: { item: FirstContactOperationResult["items"][number]; retrying: boolean; onRetry: () => void }) {
  const resource = item.resourceKind as FirstContactResource;
  const result = item.result ?? (item.availability === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "UNKNOWN") as FirstContactResult;
  return <div className="rounded-xl border border-black/[0.06] bg-white p-2.5"><p className="text-xs font-black">{firstContactResourceLabel(resource)}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${resultClass[result]}`}>{resultLabel[result]}</span>{result === "FAILED" ? <button type="button" disabled={retrying} onClick={onRetry} className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-[var(--ink)] underline">{retrying ? <LoaderCircle size={12} className="animate-spin" /> : <RefreshCw size={12} />}Reintentar</button> : null}</div>;
}
