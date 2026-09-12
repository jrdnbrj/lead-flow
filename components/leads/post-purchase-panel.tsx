"use client";

import { Check, ChevronDown, ChevronUp, Circle, LoaderCircle, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { completePostPurchaseMilestoneAction, loadPostPurchaseCaseAction, revertPostPurchaseMilestoneAction } from "@/lib/leads/actions";
import { PostPurchaseDocuments } from "@/components/leads/post-purchase-documents";
import { postPurchaseMilestones, type PostPurchaseCaseReadModel, type PostPurchaseMilestone, type PostPurchaseMilestoneType, type PostPurchasePurchaseStatus } from "@/lib/postpurchase/types";

function formatCompletedAt(value: string): string {
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Guayaquil" }).format(new Date(value)).replace(".", "");
}

function milestoneLabel(type: PostPurchaseMilestoneType): string {
  return postPurchaseMilestones.find((milestone) => milestone.type === type)?.label ?? type;
}

function milestoneActivityAt(milestone: PostPurchaseMilestone): string | null {
  if (milestone.status === "COMPLETED") return milestone.completedAt;
  if (milestone.status === "REVERTED") return milestone.revertedAt;
  return null;
}

export function PostPurchasePanel({ leadId, purchaseStatus }: { leadId: string; purchaseStatus: PostPurchasePurchaseStatus }) {
  const [data, setData] = useState<PostPurchaseCaseReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [busyMilestone, setBusyMilestone] = useState<PostPurchaseMilestoneType | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const requestIdRef = useRef(0);
  const requestContextRef = useRef({ leadId, purchaseStatus });

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestContext = { leadId, purchaseStatus };
    const isCurrentRequest = () => requestId === requestIdRef.current
      && requestContextRef.current.leadId === requestContext.leadId
      && requestContextRef.current.purchaseStatus === requestContext.purchaseStatus;

    setIsLoading(true);
    setLoadingError(null);
    try {
      const response = await loadPostPurchaseCaseAction(leadId);
      if (!isCurrentRequest()) return;
      if (response.success && response.data) {
        setData(response.data);
        setActionError(null);
      } else {
        setLoadingError(response.error || "No pudimos cargar Postcompra. Puedes reintentarlo.");
      }
    } catch {
      if (isCurrentRequest()) setLoadingError("No pudimos cargar Postcompra. Puedes reintentarlo.");
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
    }
  }, [leadId, purchaseStatus]);

  const retryLoad = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    requestContextRef.current = { leadId, purchaseStatus };
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const timeoutId = window.setTimeout(() => {
      if (requestId === requestIdRef.current) void load();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      if (requestId === requestIdRef.current) requestIdRef.current += 1;
    };
  }, [leadId, load, purchaseStatus]);

  async function complete(milestoneType: PostPurchaseMilestoneType) {
    if (!data?.case || busyMilestone || data.status === "PAUSED") return;
    setBusyMilestone(milestoneType);
    setActionError(null);
    try {
      const response = await completePostPurchaseMilestoneAction({ caseId: data.case.id, milestoneType });
      if (response.success && response.data) setData(response.data);
      else setActionError(response.error || "No pudimos marcar la etapa. Puedes reintentarlo.");
    } catch {
      setActionError("No pudimos marcar la etapa. Puedes reintentarlo.");
    } finally {
      setBusyMilestone(null);
    }
  }

  async function revert(milestoneType: PostPurchaseMilestoneType) {
    if (!data?.case || busyMilestone || data.status === "PAUSED") return;
    setBusyMilestone(milestoneType);
    setActionError(null);
    try {
      const response = await revertPostPurchaseMilestoneAction({ caseId: data.case.id, milestoneType });
      if (response.success && response.data) setData(response.data);
      else setActionError(response.error || "No pudimos corregir la etapa. Puedes reintentarlo.");
    } catch {
      setActionError("No pudimos corregir la etapa. Puedes reintentarlo.");
    } finally {
      setBusyMilestone(null);
    }
  }

  if (isLoading) return <section className="mt-2 rounded-xl border border-black/[0.06] bg-[#faf9f6] p-3" aria-label="Postcompra"><div className="flex items-center gap-2 text-xs font-black text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin" />Cargando Postcompra…</div></section>;

  if (loadingError) return <section className="mt-2 rounded-xl border border-[#f3c0b8] bg-[#fff8f6] p-3" aria-label="Postcompra"><div className="flex items-start gap-2 text-xs font-semibold text-[#b33a2c]"><TriangleAlert size={14} className="mt-0.5 shrink-0" /><span>{loadingError}</span></div><button type="button" onClick={retryLoad} className="mt-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-black text-[var(--ink)] shadow-sm">Reintentar</button></section>;

  if (!data || data.status === "NOT_PURCHASED") return null;

  const paused = purchaseStatus === "REVERTED" || data.status === "PAUSED";
  const milestones = [...data.milestones].sort((a, b) => a.position - b.position);

  return <section className="mt-2 min-w-0 rounded-xl border border-black/[0.06] bg-[#faf9f6] p-2.5" aria-label="Postcompra" onClick={(event) => event.stopPropagation()}>
    <button type="button" aria-expanded={!isCollapsed} aria-controls={`postpurchase-content-${leadId}`} onClick={() => setIsCollapsed((current) => !current)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
      <span className="flex items-center gap-2 text-xs font-black"><Circle size={14} className={paused ? "text-[#8c6c00]" : "text-[var(--ink)]"} />Postcompra</span>
      <span className="flex items-center gap-1.5"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${paused ? "bg-[#fff0bd] text-[#765000]" : "bg-white text-[var(--muted)]"}`}>{paused ? "Postcompra pausada" : `${data.completedCount} de ${data.total} completados`}</span>{isCollapsed ? <ChevronDown size={14} className="text-[var(--muted)]" /> : <ChevronUp size={14} className="text-[var(--muted)]" />}</span>
    </button>
    {actionError ? <p className="mt-2 flex items-start gap-2 rounded-lg bg-[#fff0ee] px-2.5 py-2 text-[11px] font-semibold text-[#b33a2c]" role="alert"><TriangleAlert size={13} className="mt-0.5 shrink-0" />{actionError}</p> : null}
    {!isCollapsed ? <div id={`postpurchase-content-${leadId}`}>
      {paused ? <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">La compra está desmarcada. Se conserva el avance y se reactivará al volver a registrar la compra.</p> : null}
      {milestones.length ? <div className="mt-2 grid grid-cols-2 gap-1.5">{milestones.map((milestone) => {
      const busy = busyMilestone === milestone.milestoneType;
      const completed = milestone.status === "COMPLETED";
      const activityAt = milestoneActivityAt(milestone);
      return <div key={milestone.id} className="min-w-0 rounded-xl border border-black/[0.05] bg-white/95 px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:border-black/[0.1]">
        <label className={`flex min-w-0 items-center gap-2 ${paused || busy ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <span className="relative grid size-5 shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={completed}
              disabled={paused || busy}
              aria-busy={busy}
              aria-label={`${completed ? "Desmarcar" : "Marcar como hecho"}: ${milestoneLabel(milestone.milestoneType)}`}
              onChange={(event) => event.target.checked ? void complete(milestone.milestoneType) : void revert(milestone.milestoneType)}
              className="peer absolute size-px opacity-0"
            />
            <span aria-hidden="true" className="grid size-5 place-items-center rounded-[7px] border border-[#d7d7d2] bg-[#fbfbfa] text-[#19310f] transition-[background-color,border-color,box-shadow,transform] duration-150 peer-checked:border-[#b8f451] peer-checked:bg-[#b8f451] peer-checked:shadow-[0_2px_5px_rgba(132,180,36,0.22)] peer-focus-visible:ring-4 peer-focus-visible:ring-[#b8f451]/25 peer-disabled:bg-[#f2f1ed] peer-disabled:opacity-50">
              {busy ? <LoaderCircle size={13} className="animate-spin text-[var(--muted)]" /> : completed ? <Check size={13} strokeWidth={3} /> : null}
            </span>
          </span>
          <span className="min-w-0 flex-1 break-words text-xs font-semibold leading-4 text-[var(--ink)]">{milestoneLabel(milestone.milestoneType)}</span>
        </label>
        {activityAt ? <p className="mt-1 pl-7 text-[10px] font-medium tracking-[0.01em] text-[var(--muted)]">{formatCompletedAt(activityAt)}</p> : null}
      </div>;
      })}</div> : <p className="mt-2 text-[11px] font-semibold text-[var(--muted)]">No hay etapas registradas para este caso.</p>}
      {data.case ? <PostPurchaseDocuments purchaseCaseId={data.case.id} paused={paused} /> : null}
    </div> : null}
  </section>;
}
