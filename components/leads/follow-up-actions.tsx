"use client";

import { Ban, CalendarClock, Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import type { FollowUpAction, ScheduleShortcut } from "@/lib/domain/lead";
import { getFollowUpActionStatusLabel, getNextActionLabel } from "@/lib/domain/lead";
import { clearLeadActionAction, scheduleLeadActionAction, updateFollowUpActionAction } from "@/lib/leads/actions";
import { formatNextActionDate, isLeadReminderDue } from "@/lib/leads/follow-up";

type TransitionStatus = "DONE" | "POSTPONED" | "IGNORED" | "CANCELED";
type SchedulePreset = ScheduleShortcut | "CUSTOM";
type SelectableActionType = "CALL" | "WHATSAPP" | "QUOTE";

const actionTypes: Array<{ value: SelectableActionType; label: string }> = [
  { value: "CALL", label: "Llamar" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "QUOTE", label: "Cotizar" },
];

const schedulePresets: Array<{ value: SchedulePreset; label: string }> = [
  { value: "POSTPONE_PLUS_ONE_HOUR", label: "En 1 hora" },
  { value: "POSTPONE_LATER", label: "Más tarde" },
  { value: "POSTPONE_TOMORROW", label: "Mañana" },
  { value: "POSTPONE_IN_THREE_DAYS", label: "En 3 días" },
  { value: "CUSTOM", label: "Elegir fecha y hora" },
];

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
  const [actionType, setActionType] = useState<SelectableActionType | "">("");
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset | "">("");
  const [customDateTime, setCustomDateTime] = useState("");
  const [note, setNote] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [isIgnoringAll, setIsIgnoringAll] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const openActions = actions.filter(isOpenAction);
  const canSchedule = Boolean(actionType && schedulePreset && (schedulePreset !== "CUSTOM" || customDateTime));

  async function schedule() {
    if (isScheduling || !actionType || !schedulePreset) return;
    const scheduledFor = schedulePreset === "CUSTOM" && customDateTime ? new Date(`${customDateTime}:00-05:00`).toISOString() : undefined;
    if (schedulePreset === "CUSTOM" && !scheduledFor) {
      onError?.("Elige una fecha y hora para programar la acción.");
      return;
    }
    setIsScheduling(true);
    onError?.(null);
    onInfo?.(null);
    const response = await scheduleLeadActionAction({ leadId, actionType, shortcut: schedulePreset === "CUSTOM" ? undefined : schedulePreset, scheduledFor, note });
    if (response.success && response.data) {
      onActionsChange([...actions, response.data.action]);
      onConversationWaiting?.();
      setActionType("");
      setSchedulePreset("");
      setCustomDateTime("");
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

  return <div className="compact-follow-up mt-2 min-w-0 max-w-full overflow-hidden rounded-xl bg-[#faf9f6] p-2">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black"><CalendarClock size={15} />Seguimiento del lead</div>{openActions.length ? <button type="button" disabled={isIgnoringAll || !!busyActionId} aria-busy={isIgnoringAll} onClick={() => void ignoreAll()} className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-50">{isIgnoringAll ? "Ignorando…" : "Ignorar pendientes"}</button> : null}</div>
    {isIgnoringAll ? <p className="mt-1 text-[11px] font-bold text-[var(--muted)]" aria-live="polite">Actualizando pendientes…</p> : null}
    {actions.length ? <div className="mt-2 space-y-1.5">{actions.map((action) => {
      const due = isOpenAction(action) && isLeadReminderDue(action.scheduledFor);
      return <div key={action.id} className={`rounded-lg border px-2 py-1.5 ${due ? "border-[#f3b257] bg-[#fff8ed]" : "border-black/[0.06] bg-white"}`}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${actionStatusClasses(action.status)}`}>{getFollowUpActionStatusLabel(action.status)}</span><span className={`text-xs font-black ${due ? "text-[#b94910]" : "text-[var(--ink)]"}`}>{due ? "Para hoy · " : ""}{getNextActionLabel(action.actionType)}</span><span className="text-[10px] text-[var(--muted)]">{formatNextActionDate(action.scheduledFor)}</span></div>{action.note ? <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--muted)]">{action.note}</p> : null}</div>{isOpenAction(action) ? <div className="flex flex-wrap gap-1"><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "DONE")} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#e4f8e9] px-2 text-[10px] font-black text-[#18733a] disabled:opacity-50"><Check size={12} />Hecha</button><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "POSTPONED")} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#edf3ff] px-2 text-[10px] font-black text-[#3c5f9b] disabled:opacity-50"><RotateCcw size={12} />+1 día</button><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "IGNORED")} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2 text-[10px] font-black text-[#777c86] disabled:opacity-50"><Ban size={12} />Ignorar</button><button type="button" disabled={busyActionId === action.id || isIgnoringAll} onClick={() => void transition(action, "CANCELED")} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2 text-[10px] font-black text-[#777c86] disabled:opacity-50"><X size={12} />Cancelar</button></div> : null}</div>
      </div>;
    })}</div> : <p className="mt-1 text-[11px] font-semibold text-[var(--muted)]">Sin próxima acción.</p>}
    <div className="mt-2 border-t border-black/[0.06] pt-2">
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Qué acción realizar">
        {actionTypes.map((option) => <button key={option.value} type="button" role="radio" aria-checked={actionType === option.value} onClick={() => setActionType(option.value)} className={`h-8 rounded-lg border px-1 text-[10px] font-black transition ${actionType === option.value ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/10 bg-white text-[var(--muted)] hover:border-black/25"}`}>{option.label}</button>)}
      </div>
      <div className="mt-1 grid grid-cols-[repeat(5,minmax(0,1fr))] gap-1" role="radiogroup" aria-label="Cuándo programar el recordatorio">
        {schedulePresets.map((preset) => <button key={preset.value} type="button" role="radio" aria-checked={schedulePreset === preset.value} onClick={() => setSchedulePreset(preset.value)} className={`min-h-8 min-w-0 rounded-lg border px-1 text-[9px] font-black leading-3 transition ${schedulePreset === preset.value ? "border-[#3c5f9b] bg-[#edf3ff] text-[#24578e]" : "border-black/10 bg-white text-[var(--muted)] hover:border-black/25"}`}>{preset.label}</button>)}
      </div>
      {schedulePreset === "CUSTOM" ? <input aria-label="Fecha y hora de la acción" type="datetime-local" value={customDateTime} onChange={(event) => setCustomDateTime(event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-black/10 bg-white px-2 text-[11px] font-bold" /> : null}
      <div className="mt-1 flex items-center gap-1.5"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota opcional" className="h-8 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 text-[11px] font-semibold outline-none placeholder:text-[#9a9b9b]" /><button type="button" onClick={() => void schedule()} disabled={!canSchedule || isScheduling || isIgnoringAll} className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[var(--ink)] px-2.5 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{isScheduling ? <><LoaderCircle size={12} className="animate-spin" />Guardando</> : "Programar"}</button></div>
    </div>
  </div>;
}
