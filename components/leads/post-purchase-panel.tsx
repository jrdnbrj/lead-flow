"use client";

import { Check, Circle, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { completePostPurchaseMilestoneAction, loadPostPurchaseCaseAction, revertPostPurchaseMilestoneAction } from "@/lib/leads/actions";
import { postPurchaseMilestones, type PostPurchaseCaseReadModel, type PostPurchaseMilestone, type PostPurchaseMilestoneType, type PostPurchasePurchaseStatus } from "@/lib/postpurchase/types";

function formatCompletedAt(value: string): string {
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Guayaquil" }).format(new Date(value)).replace(".", "");
}

function milestoneLabel(type: PostPurchaseMilestoneType): string {
  return postPurchaseMilestones.find((milestone) => milestone.type === type)?.label ?? type;
}

function statusLabel(status: PostPurchaseMilestone["status"]): string {
  return status === "COMPLETED" ? "Completado" : status === "REVERTED" ? "Pendiente" : "Pendiente";
}

export function PostPurchasePanel({ leadId, purchaseStatus }: { leadId: string; purchaseStatus: PostPurchasePurchaseStatus }) {
  const [data, setData] = useState<PostPurchaseCaseReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [busyMilestone, setBusyMilestone] = useState<PostPurchaseMilestoneType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await loadPostPurchaseCaseAction(leadId);
    if (response.success && response.data) {
      setData(response.data);
      setActionError(null);
    } else {
      setLoadingError(response.error || "No pudimos cargar Postcompra. Puedes reintentarlo.");
    }
    setIsLoading(false);
  }, [leadId]);

  const retryLoad = useCallback(() => {
    setIsLoading(true);
    setLoadingError(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function complete(milestoneType: PostPurchaseMilestoneType) {
    if (!data?.case || busyMilestone || data.status === "PAUSED") return;
    setBusyMilestone(milestoneType);
    setActionError(null);
    const response = await completePostPurchaseMilestoneAction({ caseId: data.case.id, milestoneType });
    if (response.success && response.data) setData(response.data);
    else setActionError(response.error || "No pudimos marcar la etapa. Puedes reintentarlo.");
    setBusyMilestone(null);
  }

  async function revert(milestoneType: PostPurchaseMilestoneType) {
    if (!data?.case || busyMilestone || data.status === "PAUSED") return;
    if (!window.confirm(`¿Corregir la etapa “${milestoneLabel(milestoneType)}”? Volverá a quedar pendiente.`)) return;
    setBusyMilestone(milestoneType);
    setActionError(null);
    const response = await revertPostPurchaseMilestoneAction({ caseId: data.case.id, milestoneType });
    if (response.success && response.data) setData(response.data);
    else setActionError(response.error || "No pudimos corregir la etapa. Puedes reintentarlo.");
    setBusyMilestone(null);
  }

  if (isLoading) return <section className="mt-2 rounded-xl border border-black/[0.06] bg-[#faf9f6] p-3" aria-label="Postcompra"><div className="flex items-center gap-2 text-xs font-black text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin" />Cargando Postcompra…</div></section>;

  if (loadingError) return <section className="mt-2 rounded-xl border border-[#f3c0b8] bg-[#fff8f6] p-3" aria-label="Postcompra"><div className="flex items-start gap-2 text-xs font-semibold text-[#b33a2c]"><TriangleAlert size={14} className="mt-0.5 shrink-0" /><span>{loadingError}</span></div><button type="button" onClick={retryLoad} className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-[var(--ink)] shadow-sm">Reintentar</button></section>;

  if (!data || data.status === "NOT_PURCHASED") return null;

  const paused = purchaseStatus === "REVERTED" || data.status === "PAUSED";
  const milestones = [...data.milestones].sort((a, b) => a.position - b.position);

  return <section className="mt-2 min-w-0 rounded-xl border border-black/[0.06] bg-[#faf9f6] p-2.5" aria-label="Postcompra" onClick={(event) => event.stopPropagation()}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-black"><Circle size={14} className={paused ? "text-[#8c6c00]" : "text-[var(--ink)]"} />Postcompra</div>
      <span className={`rounded-full px-2 py-1 text-[10px] font-black ${paused ? "bg-[#fff0bd] text-[#765000]" : "bg-white text-[var(--muted)]"}`}>{paused ? "Postcompra pausada" : `${data.completedCount} de ${data.total} completados`}</span>
    </div>
    {paused ? <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">La compra está desmarcada. Se conserva el avance y se reactivará al volver a registrar la compra.</p> : null}
    {actionError ? <p className="mt-2 flex items-start gap-2 rounded-lg bg-[#fff0ee] px-2.5 py-2 text-[11px] font-semibold text-[#b33a2c]" role="alert"><TriangleAlert size={13} className="mt-0.5 shrink-0" />{actionError}</p> : null}
    {milestones.length ? <div className="mt-2 space-y-1.5">{milestones.map((milestone) => {
      const busy = busyMilestone === milestone.milestoneType;
      const completed = milestone.status === "COMPLETED";
      return <div key={milestone.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5"><span className={`grid size-5 shrink-0 place-items-center rounded-full ${completed ? "bg-[#e4f8e9] text-[#18733a]" : milestone.status === "REVERTED" ? "bg-[#fff0bd] text-[#8c6c00]" : "bg-[#f0eee8] text-[var(--muted)]"}`}>{completed ? <Check size={12} /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className="truncate text-xs font-black text-[var(--ink)]">{milestoneLabel(milestone.milestoneType)}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black ${completed ? "bg-[#e4f8e9] text-[#18733a]" : "bg-[#f0eee8] text-[var(--muted)]"}`}>{statusLabel(milestone.status)}</span></div>
          {completed && milestone.completedAt ? <p className="mt-1 pl-6 text-[10px] font-semibold text-[var(--muted)]">{formatCompletedAt(milestone.completedAt)} · asesor</p> : null}
          {milestone.status === "REVERTED" && milestone.revertedAt ? <p className="mt-1 pl-6 text-[10px] font-semibold text-[#8c6c00]">Corregido {formatCompletedAt(milestone.revertedAt)}</p> : null}
        </div>
        {!paused ? completed ? <button type="button" disabled={busy} aria-busy={busy} onClick={() => void revert(milestone.milestoneType)} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#f1f1f1] px-2.5 text-[10px] font-black text-[var(--muted)] disabled:cursor-wait disabled:opacity-50">{busy ? <LoaderCircle size={12} className="animate-spin" /> : <RotateCcw size={12} />} {busy ? "Guardando…" : "Corregir"}</button> : <button type="button" disabled={busy} aria-busy={busy} onClick={() => void complete(milestone.milestoneType)} className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#e4f8e9] px-2.5 text-[10px] font-black text-[#18733a] disabled:cursor-wait disabled:opacity-50">{busy ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />} {busy ? "Guardando…" : "Marcar como hecho"}</button> : null}
      </div>;
    })}</div> : <p className="mt-2 text-[11px] font-semibold text-[var(--muted)]">No hay etapas registradas para este caso.</p>}
  </section>;
}
