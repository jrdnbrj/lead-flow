"use client";

import { Ban, CalendarClock, Check, Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import type { FollowUpAction, NextActionType } from "@/lib/domain/lead";
import { getFollowUpActionStatusLabel, getNextActionLabel } from "@/lib/domain/lead";
import { clearLeadActionAction, scheduleLeadActionAction, updateFollowUpActionAction } from "@/lib/leads/actions";
import { formatNextActionDate, isLeadReminderDue } from "@/lib/leads/follow-up";

type TransitionStatus = "DONE" | "POSTPONED" | "IGNORED" | "CANCELED";

function actionStatusClasses(status: FollowUpAction["status"]): string {
  return {
    PENDING: "border-[#f0ca68] bg-[#fff0bd] text-[#765000]",
    POSTPONED: "border-[#a9c9f4] bg-[#dceaff] text-[#24578e]",
    DONE: "border-[#9bd3a8] bg-[#ccefd6] text-[#176333]",
    IGNORED: "border-[#d0d3d8] bg-[#e5e7eb] text-[#59616d]",
    CANCELED: "border-[#d0d3d8] bg-[#e5e7eb] text-[#59616d]",
  }[status];
}

function isOpenAction(action: FollowUpAction): boolean {
  return action.status === "PENDING" || action.status === "POSTPONED";
}

export function FollowUpActions({
  leadId,
  actions,
  onActionsChange,
  onConversationWaiting,
  onError,
  onInfo,
}: {
  leadId: string;
  actions: FollowUpAction[];
  onActionsChange: (actions: FollowUpAction[]) => void;
  onConversationWaiting?: () => void;
  onError?: (message: string | null) => void;
  onInfo?: (message: string | null) => void;
}) {
  const [actionType, setActionType] = useState<NextActionType>("CALL");
  const [days, setDays] = useState("3");
  const [note, setNote] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [isIgnoringAll, setIsIgnoringAll] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const openActions = actions.filter(isOpenAction);

  async function schedule() {
    if (isScheduling) return;
    setIsScheduling(true);
    onError?.(null);
    onInfo?.(null);
    const response = await scheduleLeadActionAction({ leadId, actionType, days: Number(days), note });
    if (response.success && response.data) {
      onActionsChange([...actions, response.data.action]);
      onConversationWaiting?.();
      setNote("");
      onInfo?.(`Recordatorio agregado: ${formatNextActionDate(response.data.nextActionAt) ?? "fecha programada"}.`);
    } else {
      onError?.(response.error || "No pudimos programar el recordatorio.");
    }
    setIsScheduling(false);
  }

  async function transition(action: FollowUpAction, status: TransitionStatus) {
    if (busyActionId || isIgnoringAll) return;
    setBusyActionId(action.id);
    onError?.(null);
    const response = await updateFollowUpActionAction({ actionId: action.id, status, postponeDays: status === "POSTPONED" ? 1 : undefined, expectedActionVersion: action.actionVersion });
    if (response.success && response.data) {
      onActionsChange(actions.map((current) => current.id === action.id ? response.data!.action : current));
      onInfo?.(status === "DONE" ? "Acción marcada como hecha." : status === "POSTPONED" ? "Acción pospuesta para mañana." : status === "IGNORED" ? "Acción ignorada." : "Acción cancelada.");
    } else {
      onError?.(response.error || "No pudimos actualizar ese recordatorio.");
    }
    setBusyActionId(null);
  }

  async function ignoreAll() {
    if (!openActions.length || isIgnoringAll || busyActionId) return;
    setIsIgnoringAll(true);
    onError?.(null);
    onInfo?.(null);
    try {
      const response = await clearLeadActionAction(leadId);
      if (response.success) {
        const now = new Date().toISOString();
        onActionsChange(actions.map((action) => isOpenAction(action) ? { ...action, status: "IGNORED", completedAt: now } : action));
        onInfo?.("Pendientes ignorados. No volverán a generar alertas.");
      } else {
        onError?.(response.error || "No pudimos actualizar el seguimiento.");
      }
    } catch {
      onError?.("No pudimos actualizar el seguimiento. Puedes reintentarlo.");
    } finally {
      setIsIgnoringAll(false);
    }
  }

  return <div className="compact-follow-up mt-3 rounded-2xl bg-[#faf9f6] p-2.5">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black"><CalendarClock size={15} />Seguimiento del lead</div>{openActions.length ? <button type="button" disabled={isIgnoringAll || !!busyActionId} aria-busy={isIgnoringAll} onClick={() => void ignoreAll()} className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-50">{isIgnoringAll ? "Ignorando…" : "Ignorar pendientes"}</button> : null}</div>
    {isIgnoringAll ? <p className="mt-2 text-[11px] font-bold text-[var(--muted)]" aria-live="polite">Actualizando pendientes…</p> : null}
    {actions.length ? <div className="mt-3 space-y-2">{actions.map((action) => {
      const due = isOpenAction(action) && isLeadReminderDue(action.scheduledFor);
      return <div key={action.id} className={`rounded-xl border px-3 py-2.5 ${due ? "border-[#f3b257] bg-[#fff8ed]" : "border-black/[0.06] bg-white"}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${actionStatusClasses(action.status)}`}>{getFollowUpActionStatusLabel(action.status)}</span><span className={`text-xs font-black ${due ? "text-[#b94910]" : "text-[var(--ink)]"}`}>{due ? "Para hoy · " : ""}{getNextActionLabel(action.actionType)}</span><span className="text-[11px] text-[var(--muted)]">{formatNextActionDate(action.scheduledFor)}</span></div>{action.note ? <p className="mt-1 line-clamp-1 text-[11px] text-[var(--muted)]">{action.note}</p> : null}</div>{isOpenAction(action) ? <div className="flex flex-wrap gap-1.5"><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "DONE")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#e4f8e9] px-2.5 text-[11px] font-black text-[#18733a] disabled:opacity-50"><Check size={13} />Hecha</button><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "POSTPONED")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#edf3ff] px-2.5 text-[11px] font-black text-[#3c5f9b] disabled:opacity-50"><RotateCcw size={13} />+1 día</button><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "IGNORED")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2.5 text-[11px] font-black text-[#777c86] disabled:opacity-50"><Ban size={13} />Ignorar</button><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "CANCELED")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2.5 text-[11px] font-black text-[#777c86] disabled:opacity-50"><X size={13} />Cancelar</button></div> : null}</div>
      </div>;
    })}</div> : <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Sin próxima acción.</p>}
    <div className="mt-3 flex flex-col gap-2 border-t border-black/[0.06] pt-3 sm:flex-row sm:flex-wrap sm:items-center"><span className="flex items-center gap-1.5 text-[11px] font-black text-[var(--muted)]"><Plus size={14} />Agregar acción</span><select aria-label="Tipo de siguiente acción" value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-bold"><option value="CALL">Llamar</option><option value="WHATSAPP">WhatsApp</option><option value="QUOTE">Cotizar</option><option value="OTHER">Otra</option></select><select aria-label="Días para el recordatorio" value={days} onChange={(event) => setDays(event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-bold"><option value="1">Mañana</option><option value="3">En 3 días</option><option value="7">En 7 días</option><option value="14">En 14 días</option></select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional" className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 text-xs font-semibold outline-none placeholder:text-[#9a9b9b]" /><button type="button" onClick={() => void schedule()} disabled={isScheduling || isIgnoringAll} className="h-9 rounded-lg bg-[var(--ink)] px-3 text-xs font-black text-white disabled:opacity-60">{isScheduling ? "Guardando" : "Programar"}</button></div>
  </div>;
}
