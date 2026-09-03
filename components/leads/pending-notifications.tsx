"use client";

import { Ban, Bell, Check, ChevronDown, ChevronUp, Clock3, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import type { FollowUpAction, Lead, ScheduleShortcut } from "@/lib/domain/lead";
import { getNextActionLabel } from "@/lib/domain/lead";
import { updateFollowUpActionAction } from "@/lib/leads/actions";
import { formatElapsedSince, formatScheduledDateTime, isLeadReminderDue } from "@/lib/leads/follow-up";

type PendingNotification = { lead: Lead; action: FollowUpAction };
const shortcuts: Array<{ value: ScheduleShortcut; label: string }> = [
  { value: "POSTPONE_PLUS_ONE_HOUR", label: "En 1 hora" },
  { value: "POSTPONE_LATER", label: "Más tarde" },
  { value: "POSTPONE_TOMORROW", label: "Mañana" },
  { value: "POSTPONE_IN_THREE_DAYS", label: "En 3 días" },
];

export function PendingNotifications({ leads }: { leads: Lead[] }) {
  const [localActions, setLocalActions] = useState<Record<string, FollowUpAction>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const pending = useMemo(() => {
    const rows: PendingNotification[] = [];
    for (const lead of leads) for (const original of lead.followUpActions) {
      const action = localActions[original.id] ?? original;
      if (action.status === "PENDING" || action.status === "POSTPONED") rows.push({ lead, action });
    }
    return rows.sort((a, b) => new Date(a.action.scheduledFor).getTime() - new Date(b.action.scheduledFor).getTime() || a.lead.id.localeCompare(b.lead.id) || a.action.id.localeCompare(b.action.id));
  }, [leads, localActions]);
  const dueCount = pending.filter((row) => isLeadReminderDue(row.action.scheduledFor)).length;
  const scheduledCount = pending.length - dueCount;
  const statusSummary = error && !pending.length
    ? "Revisa el aviso"
    : [
        dueCount ? `${dueCount} vencida${dueCount === 1 ? "" : "s"}` : null,
        scheduledCount ? `${scheduledCount} programada${scheduledCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join(" · ") || "Sin pendientes";

  async function transition(row: PendingNotification, status: "DONE" | "IGNORED" | "POSTPONED", shortcut?: ScheduleShortcut, scheduledFor?: string) {
    if (busyId) return;
    setBusyId(row.action.id); setError(null);
    const response = await updateFollowUpActionAction({ actionId: row.action.id, status, shortcut, scheduledFor, expectedActionVersion: row.action.actionVersion });
    if (response.success && response.data) setLocalActions((current) => ({ ...current, [row.action.id]: response.data!.action }));
    else {
      setError(response.error || "No pudimos actualizar la notificación.");
      setIsCollapsed(false);
    }
    setBusyId(null);
  }

  if (!pending.length && !error) return null;

  return <section className="rounded-2xl border border-[#dce5ef] bg-[#f8fbff] p-2.5 shadow-[0_8px_24px_rgba(16,24,40,0.04)] sm:p-3" aria-label="Notificaciones pendientes">
    <button type="button" aria-expanded={!isCollapsed} aria-controls="pending-notifications-content" onClick={() => setIsCollapsed((current) => !current)} className="flex w-full items-center gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3c5f9b]/30"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#e7effd] text-[#3c5f9b]"><Bell size={15} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">Notificaciones pendientes</span><span className={`mt-0.5 block truncate text-[10px] font-bold ${dueCount ? "text-[#b94910]" : "text-[var(--muted)]"}`}>{statusSummary}</span></span><span className={`flex shrink-0 items-baseline gap-1 rounded-xl px-2.5 py-1 ${dueCount ? "bg-[#fff0e6] text-[#b94910]" : "bg-white text-[var(--ink)]"}`}><strong className="text-base font-black leading-none">{pending.length}</strong><span className="text-[9px] font-black uppercase tracking-[0.06em]">{pending.length === 1 ? "pendiente" : "pendientes"}</span></span><span className="grid size-7 shrink-0 place-items-center rounded-lg text-[var(--muted)]" aria-hidden="true">{isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</span></button>
    {!isCollapsed ? <div id="pending-notifications-content">{pending.length ? <div className="mt-2 space-y-1.5">{pending.map((row) => { const due = isLeadReminderDue(row.action.scheduledFor); const busy = busyId === row.action.id; const scheduleLabel = due ? `Vencida · ${formatElapsedSince(row.action.scheduledFor)}` : formatScheduledDateTime(row.action.scheduledFor) ?? row.action.scheduledFor; return <article key={row.action.id} aria-busy={busy} className="rounded-xl border border-black/[0.06] bg-white px-2.5 py-2"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><div className="min-w-0 flex-1"><p className="truncate text-xs font-black">{row.lead.fullName} <span className="font-semibold text-[var(--muted)]">· {row.lead.phone}</span></p><p className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold ${due ? "text-[#b94910]" : "text-[var(--muted)]"}`}><Clock3 size={11} />{getNextActionLabel(row.action.actionType)} · {scheduleLabel}</p>{row.action.note ? <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{row.action.note}</p> : null}</div><div className="flex flex-wrap gap-1"><button type="button" disabled={busy} onClick={() => void transition(row, "DONE")} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#e4f8e9] px-2 text-[10px] font-black text-[#18733a] disabled:opacity-50"><Check size={12} />{busy ? "…" : "Hecha"}</button><button type="button" disabled={busy} onClick={() => void transition(row, "IGNORED")} className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2 text-[10px] font-black text-[#777c86] disabled:opacity-50"><Ban size={12} />{busy ? "…" : "Ignorar"}</button></div></div>{busy ? <p className="mt-1 text-[10px] font-bold text-[var(--muted)]" aria-live="polite">Actualizando…</p> : null}<div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-black/[0.06] pt-1.5"><span className="mr-0.5 inline-flex items-center gap-1 text-[10px] font-black text-[var(--muted)]"><RotateCcw size={11} />Posponer</span>{shortcuts.map((shortcut) => <button key={shortcut.value} type="button" disabled={busy} onClick={() => void transition(row, "POSTPONED", shortcut.value)} className="rounded-lg bg-[#edf3ff] px-2 py-1 text-[10px] font-black text-[#3c5f9b] disabled:opacity-50">{busy ? "…" : shortcut.label}</button>)}</div></article>; })}</div> : <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[11px] font-semibold text-[var(--muted)]">No tienes notificaciones pendientes.</p>}
      {error ? <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-600" role="alert"><TriangleAlert size={14} />{error}</p> : null}</div> : null}
  </section>;
}
