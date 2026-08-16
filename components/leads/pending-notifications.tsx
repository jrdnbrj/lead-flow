"use client";

import { Ban, Bell, Check, Clock3, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import type { FollowUpAction, Lead, ScheduleShortcut } from "@/lib/domain/lead";
import { getNextActionLabel } from "@/lib/domain/lead";
import { updateFollowUpActionAction } from "@/lib/leads/actions";
import { formatNextActionDate, isLeadReminderDue } from "@/lib/leads/follow-up";

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
  const pending = useMemo(() => {
    const rows: PendingNotification[] = [];
    for (const lead of leads) for (const original of lead.followUpActions) {
      const action = localActions[original.id] ?? original;
      if (action.status === "PENDING" || action.status === "POSTPONED") rows.push({ lead, action });
    }
    return rows.sort((a, b) => new Date(a.action.scheduledFor).getTime() - new Date(b.action.scheduledFor).getTime() || a.lead.id.localeCompare(b.lead.id) || a.action.id.localeCompare(b.action.id));
  }, [leads, localActions]);

  async function transition(row: PendingNotification, status: "DONE" | "IGNORED" | "POSTPONED", shortcut?: ScheduleShortcut) {
    if (busyId) return;
    setBusyId(row.action.id); setError(null);
    const response = await updateFollowUpActionAction({ actionId: row.action.id, status, shortcut, expectedActionVersion: row.action.actionVersion });
    if (response.success && response.data) setLocalActions((current) => ({ ...current, [row.action.id]: response.data!.action }));
    else setError(response.error || "No pudimos actualizar la notificación.");
    setBusyId(null);
  }

  if (!pending.length && !error) return null;

  return <section className="rounded-2xl border border-[#dce5ef] bg-[#f8fbff] p-3 shadow-[0_8px_24px_rgba(16,24,40,0.04)] sm:p-4" aria-label="Notificaciones pendientes">
    <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e7effd] text-[#3c5f9b]"><Bell size={17} /></span><div><p className="eyebrow">Seguimiento interno</p><h2 className="mt-1 text-lg font-black">Notificaciones pendientes</h2><p className="mt-1 text-xs text-[var(--muted)]">La misma acción de seguimiento, sin depender de Push.</p></div></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[var(--muted)]">{pending.length}</span></div>
    {pending.length ? <div className="mt-4 space-y-2">{pending.map((row) => { const due = isLeadReminderDue(row.action.scheduledFor); const busy = busyId === row.action.id; return <article key={row.action.id} aria-busy={busy} className="rounded-2xl border border-black/[0.06] bg-white p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-black">{row.lead.fullName}</p><p className="mt-0.5 text-xs font-bold text-[var(--ink)]">{getNextActionLabel(row.action.actionType)} <span className="font-normal text-[var(--muted)]">· versión {row.action.actionVersion ?? 1}</span></p><p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${due ? "text-[#b94910]" : "text-[var(--muted)]"}`}><Clock3 size={12} />{due ? "Vencida · " : "Programada · "}{formatNextActionDate(row.action.scheduledFor) ?? row.action.scheduledFor}</p>{row.action.note ? <p className="mt-1 line-clamp-2 text-[11px] text-[var(--muted)]">{row.action.note}</p> : null}</div><div className="flex flex-wrap gap-1.5"><button type="button" disabled={busy} onClick={() => void transition(row, "DONE")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#e4f8e9] px-2.5 text-[11px] font-black text-[#18733a] disabled:opacity-50"><Check size={13} />{busy ? "Actualizando…" : "Hecha"}</button><button type="button" disabled={busy} onClick={() => void transition(row, "IGNORED")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2.5 text-[11px] font-black text-[#777c86] disabled:opacity-50"><Ban size={13} />{busy ? "Actualizando…" : "Ignorar"}</button></div></div>{busy ? <p className="mt-2 text-[11px] font-bold text-[var(--muted)]" aria-live="polite">Actualizando seguimiento…</p> : null}<div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-black/[0.06] pt-2.5"><span className="mr-1 inline-flex items-center gap-1 text-[10px] font-black text-[var(--muted)]"><RotateCcw size={12} />Posponer</span>{shortcuts.map((shortcut) => <button key={shortcut.value} type="button" disabled={busy} onClick={() => void transition(row, "POSTPONED", shortcut.value)} className="rounded-lg bg-[#edf3ff] px-2.5 py-1.5 text-[10px] font-black text-[#3c5f9b] disabled:opacity-50">{busy ? "Actualizando…" : shortcut.label}</button>)}</div></article>; })}</div> : <p className="mt-4 rounded-xl bg-white px-3 py-3 text-xs font-semibold text-[var(--muted)]">No tienes notificaciones pendientes.</p>}
    {error ? <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-red-600" role="alert"><TriangleAlert size={14} />{error}</p> : null}
  </section>;
}
