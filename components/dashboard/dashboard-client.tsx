"use client";

import * as XLSX from "xlsx";
import { Ban, CalendarClock, Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, Flame, LoaderCircle, MessageCircle, Phone, Plus, RotateCcw, Search, Send, SlidersHorizontal, Target, Trash2, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { ConversationState, FollowUpAction, Lead, LeadStatus, LeadTemperature, NextActionType, WhatsappStatus } from "@/lib/domain/lead";
import { formatPhoneForWhatsapp, getConversationStateLabel, getFollowUpActionStatusLabel, getNextActionLabel, getStatusLabel, getTemperatureLabel, getWhatsappStatusLabel } from "@/lib/domain/lead";
import { clearLeadActionAction, deleteLeadAction, scheduleLeadActionAction, sendLeadWhatsappAction, updateFollowUpActionAction, updateLeadConversationAction } from "@/lib/leads/actions";
import { formatNextActionDate, isLeadReminderDue } from "@/lib/leads/follow-up";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TemperatureFilter = "ALL" | LeadTemperature;
type StatusFilter = "ALL" | LeadStatus;

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Todos los estados" },
  { value: "NUEVO", label: "Nuevos" },
  { value: "CONTACTADO", label: "Contactados" },
  { value: "COTIZADO", label: "Cotizados" },
];

function normalizeLead(value: unknown): Lead | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Partial<Lead>;
  if (typeof record.id !== "string" || typeof record.fullName !== "string" || typeof record.phone !== "string" || typeof record.score !== "number" || typeof record.temperature !== "string") return null;
  const legacyAction = record.nextActionAt && record.nextActionType ? [{
    id: `legacy-${record.id}`,
    leadId: record.id,
    actionType: record.nextActionType,
    scheduledFor: record.nextActionAt,
    status: "PENDING" as const,
    note: null,
    completedAt: null,
    createdAt: record.createdAt ?? new Date().toISOString(),
    updatedAt: record.createdAt ?? new Date().toISOString(),
  }] : [];
  return {
    ...record,
    userId: record.userId ?? null,
    tenantId: record.tenantId ?? null,
    createdAt: record.createdAt ?? new Date().toISOString(),
    carModel: record.carModel ?? "Modelo por definir",
    timeframe: record.timeframe ?? "EXPLORANDO",
    paymentMethod: record.paymentMethod ?? "POR_DEFINIR",
    tradeInCar: record.tradeInCar ?? false,
    notes: record.notes ?? null,
    whatsappStatus: record.whatsappStatus ?? "PENDING",
    conversationState: record.conversationState ?? "NEW",
    nextActionAt: record.nextActionAt ?? null,
    nextActionType: record.nextActionType ?? null,
    lastActivityAt: record.lastActivityAt ?? null,
    lastCustomerMessageAt: record.lastCustomerMessageAt ?? null,
    lastAgentMessageAt: record.lastAgentMessageAt ?? null,
    lastCustomerMessagePreview: record.lastCustomerMessagePreview ?? null,
    lastMessageDirection: record.lastMessageDirection ?? null,
    lastMessagePreview: record.lastMessagePreview ?? null,
    deletedAt: record.deletedAt ?? null,
    status: record.status ?? "NUEVO",
    followUpActions: Array.isArray(record.followUpActions) ? record.followUpActions : legacyAction,
  } as Lead;
}

function updateLocalLead(leadId: string, patch: Partial<Lead>): void {
  const stored = window.localStorage.getItem("leadflow:leads");
  if (!stored) return;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return;
    const updated = parsed.map((value) => {
      const lead = normalizeLead(value);
      return lead?.id === leadId ? { ...lead, ...patch } : value;
    });
    window.localStorage.setItem("leadflow:leads", JSON.stringify(updated));
  } catch {
    window.localStorage.removeItem("leadflow:leads");
  }
}

function removeLocalLead(leadId: string): void {
  const stored = window.localStorage.getItem("leadflow:leads");
  if (!stored) return;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return;
    window.localStorage.setItem("leadflow:leads", JSON.stringify(parsed.filter((value) => normalizeLead(value)?.id !== leadId)));
  } catch {
    window.localStorage.removeItem("leadflow:leads");
  }
}

function formatRelativeDate(date: string): string {
  const formatted = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", timeZone: "America/Guayaquil" }).format(new Date(date));
  return formatted.replace(".", "");
}

function formatToday(): string {
  return new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guayaquil" }).format(new Date());
}

function temperatureClasses(temperature: LeadTemperature): string {
  return { HIGH: "bg-[#fff0e6] text-[#b94910]", MEDIUM: "bg-[#fff8d8] text-[#8c6c00]", LOW: "bg-[#edf0f4] text-[#647084]" }[temperature];
}

function conversationClasses(state: ConversationState): string {
  return {
    NEW: "bg-[#f6f3ed] text-[#777c86]",
    ACTIVE: "bg-[#e4f8e9] text-[#18733a]",
    WAITING_CUSTOMER: "bg-[#edf3ff] text-[#3c5f9b]",
    CLOSED: "bg-[#edf0f4] text-[#647084]",
  }[state];
}

function whatsappStatusClasses(status: WhatsappStatus): string {
  return status === "FAILED" ? "bg-[#fff0ee] text-[#b33a2c]" : status === "READ" || status === "PLAYED" ? "bg-[#e4f8e9] text-[#18733a]" : "bg-[#f6f3ed] text-[#777c86]";
}

function actionStatusClasses(status: FollowUpAction["status"]): string {
  return {
    PENDING: "bg-[#fff8d8] text-[#8c6c00]",
    POSTPONED: "bg-[#edf3ff] text-[#3c5f9b]",
    DONE: "bg-[#e4f8e9] text-[#18733a]",
    IGNORED: "bg-[#f1f1f1] text-[#777c86]",
    CANCELED: "bg-[#f1f1f1] text-[#777c86]",
  }[status];
}

function isOpenAction(action: FollowUpAction): boolean {
  return action.status === "PENDING" || action.status === "POSTPONED";
}

function isDueAction(action: FollowUpAction): boolean {
  return isOpenAction(action) && isLeadReminderDue(action.scheduledFor);
}

function getNextOpenAction(lead: Lead): FollowUpAction | null {
  return lead.followUpActions.filter(isOpenAction).sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0] ?? null;
}

export function DashboardClient({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter();
  const [localLeads, setLocalLeads] = useState<Lead[]>([]);
  const [temperature, setTemperature] = useState<TemperatureFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hiddenLeadIds, setHiddenLeadIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem("leadflow:leads");
    if (!stored) return;
    let timer: number | undefined;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const validLeads = parsed.map(normalizeLead).filter((lead): lead is Lead => Boolean(lead));
        timer = window.setTimeout(() => setLocalLeads(validLeads), 0);
      }
    } catch {
      window.localStorage.removeItem("leadflow:leads");
    }
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 150);
    };
    const channel = supabase
      .channel("leadflow-dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_follow_up_actions" }, refresh)
      .subscribe();
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const leads = useMemo(() => {
    const merged = [...initialLeads, ...localLeads];
    return merged.filter((lead, index, all) => !hiddenLeadIds.includes(lead.id) && all.findIndex((candidate) => candidate.id === lead.id) === index);
  }, [hiddenLeadIds, initialLeads, localLeads]);

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const matchesTemperature = temperature === "ALL" || lead.temperature === temperature;
    const matchesStatus = status === "ALL" || lead.status === status;
    const normalizedQuery = query.toLowerCase().trim();
    const matchesQuery = !normalizedQuery || `${lead.fullName} ${lead.phone} ${lead.carModel}`.toLowerCase().includes(normalizedQuery);
    return matchesTemperature && matchesStatus && matchesQuery;
  }), [leads, query, status, temperature]);

  const activeLeads = filteredLeads.filter((lead) => lead.conversationState === "ACTIVE");
  const reminderLeads = filteredLeads.filter((lead) => lead.conversationState !== "ACTIVE" && lead.conversationState !== "CLOSED" && lead.followUpActions.some(isDueAction));
  const priorityIds = new Set([...activeLeads, ...reminderLeads].map((lead) => lead.id));
  const remainingLeads = filteredLeads.filter((lead) => !priorityIds.has(lead.id));
  const orderedLeads = [...activeLeads, ...reminderLeads, ...remainingLeads];
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(orderedLeads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleLeads = orderedLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleActiveLeads = visibleLeads.filter((lead) => lead.conversationState === "ACTIVE");
  const visibleReminderLeads = visibleLeads.filter((lead) => lead.conversationState !== "ACTIVE" && lead.conversationState !== "CLOSED" && lead.followUpActions.some(isDueAction));
  const visibleContactLeads = visibleLeads.filter((lead) => !visibleActiveLeads.includes(lead) && !visibleReminderLeads.includes(lead));
  const highCount = leads.filter((lead) => lead.temperature === "HIGH").length;
  const activeCount = leads.filter((lead) => lead.conversationState === "ACTIVE").length;
  const reminderCount = leads.filter((lead) => lead.conversationState !== "CLOSED" && lead.followUpActions.some(isDueAction)).length;
  const highPercent = leads.length ? Math.round((highCount / leads.length) * 100) : 0;

  function exportToXlsx() {
    const rows = filteredLeads.map((lead) => {
      const nextAction = getNextOpenAction(lead);
      return {
        Nombre: lead.fullName,
        Celular: lead.phone,
        Modelo: lead.carModel,
        "Momento de compra": lead.timeframe,
        "Forma de pago": lead.paymentMethod,
        Retoma: lead.tradeInCar ? "Sí" : "No",
        Puntaje: lead.score,
        Prioridad: getTemperatureLabel(lead.temperature),
        Estado: getStatusLabel(lead.status),
        Conversación: getConversationStateLabel(lead.conversationState),
        "Siguiente acción": nextAction ? getNextActionLabel(nextAction.actionType) : "Sin programar",
        "Fecha de seguimiento": nextAction?.scheduledFor || "",
        "Fecha de captura": lead.createdAt,
        Notas: lead.notes || "",
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    XLSX.writeFile(workbook, `leadflow-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-7">
      <section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Panel de ventas · {formatToday()}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-black leading-[0.96] tracking-[-0.065em] sm:text-6xl">Tu próximo cierre empieza con el siguiente lead.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Captura rápido, prioriza mejor y llega al seguimiento con el contexto que necesitas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/nuevo" className="button-primary"><Target size={17} />Capturar lead</Link>
          <Link href="/whatsapp" className="button-secondary"><MessageCircle size={17} />Conectar WhatsApp</Link>
          <button type="button" onClick={exportToXlsx} className="button-secondary"><Download size={17} />Exportar XLSX</button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <MetricCard icon={<UserRound size={16} />} label="Total leads" value={String(leads.length)} helper="capturados" tone="dark" />
        <MetricCard icon={<Flame size={16} />} label="Alta prioridad" value={`${highPercent}%`} helper={`${highCount} listos para acción`} tone="orange" />
        <MetricCard icon={<Clock3 size={16} />} label="Para hoy" value={String(reminderCount)} helper={`${activeCount} conversaciones activas primero`} tone="lime" />
      </section>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-[0_16px_50px_rgba(16,24,40,0.05)] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-black"><SlidersHorizontal size={17} />Filtra tus contactos</div>
          <label className="flex h-11 w-full items-center gap-2 rounded-xl bg-[#f6f3ed] px-3 text-[var(--muted)] lg:max-w-xs"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar nombre, celular o modelo" className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[#9a9b9b]" /></label>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((value) => {
            const label = value === "ALL" ? "Todas las prioridades" : value === "HIGH" ? "🔥 Alta" : value === "MEDIUM" ? "Media" : "Baja";
            return <button type="button" key={value} onClick={() => { setTemperature(value); setPage(1); }} className={`filter-pill ${temperature === value ? "filter-pill-active" : ""}`}>{label}</button>;
          })}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => <button type="button" key={filter.value} onClick={() => { setStatus(filter.value); setPage(1); }} className={`filter-pill ${status === filter.value ? "filter-pill-active-muted" : ""}`}>{filter.label}</button>)}
        </div>
      </section>

      {filteredLeads.length ? <Pagination currentPage={currentPage} totalPages={totalPages} visibleCount={visibleLeads.length} totalCount={filteredLeads.length} onPageChange={setPage} /> : null}
      {visibleActiveLeads.length ? <LeadSection title="Conversaciones activas" helper="Responde primero: el cliente ya está hablando contigo." leads={visibleActiveLeads} defaultExpanded onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleReminderLeads.length ? <LeadSection title="Recordatorios para hoy" helper="La alerta empieza a las 00:00 y permanece visible hasta resolverla." leads={visibleReminderLeads} defaultExpanded onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleContactLeads.length || (!visibleActiveLeads.length && !visibleReminderLeads.length) ? <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-xl font-black tracking-[-0.04em]">{visibleActiveLeads.length || visibleReminderLeads.length ? "Todos los contactos" : "Seguimiento"}</h2><span className="text-sm font-bold text-[var(--muted)]">{visibleContactLeads.length} en esta página</span></div>
        {visibleContactLeads.length ? visibleContactLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} />) : <div className="rounded-[22px] border border-dashed border-black/15 bg-white px-5 py-12 text-center"><Search className="mx-auto text-[var(--muted)]" size={28} /><h3 className="mt-4 font-black">No hay contactos con esos filtros</h3><p className="mt-1 text-sm text-[var(--muted)]">Prueba otra búsqueda o captura un nuevo prospecto.</p></div>}
      </section> : null}
      {filteredLeads.length > pageSize ? <Pagination currentPage={currentPage} totalPages={totalPages} visibleCount={visibleLeads.length} totalCount={filteredLeads.length} onPageChange={setPage} /> : null}
    </div>
  );
}

function LeadSection({ title, helper, leads, defaultExpanded = false, onDeleted }: { title: string; helper: string; leads: Lead[]; defaultExpanded?: boolean; onDeleted: (leadId: string) => void }) {
  return <section className="space-y-2.5"><div><div className="flex items-center justify-between"><h2 className="text-lg font-black tracking-[-0.04em]">{title}</h2><span className="text-xs font-bold text-[var(--muted)]">{leads.length}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{helper}</p></div>{leads.map((lead) => <LeadCard key={lead.id} lead={lead} defaultExpanded={defaultExpanded} onDeleted={onDeleted} />)}</section>;
}

function Pagination({ currentPage, totalPages, visibleCount, totalCount, onPageChange }: { currentPage: number; totalPages: number; visibleCount: number; totalCount: number; onPageChange: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(16,24,40,0.035)]"><span className="font-black text-[var(--ink)]">{visibleCount} visibles de {totalCount}</span><div className="flex items-center gap-2"><span className="font-semibold text-[var(--muted)]">Página {currentPage} de {totalPages}</span>{totalPages > 1 ? <div className="flex gap-1"><button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="rounded-lg border border-black/10 px-2.5 py-1.5 font-black disabled:opacity-35">Anterior</button><button type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} className="rounded-lg bg-[var(--ink)] px-2.5 py-1.5 font-black text-white disabled:opacity-35">Siguiente</button></div> : null}</div></div>;
}

function MetricCard({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string; helper: string; tone: "dark" | "orange" | "lime" }) {
  const classes = { dark: "bg-[var(--ink)] text-white", orange: "bg-[#fff0e6] text-[var(--ink)]", lime: "bg-[var(--lime)] text-[var(--ink)]" }[tone];
  return <article className={`rounded-[13px] p-2 sm:rounded-[14px] sm:p-3 ${classes}`}><div className="flex items-start justify-between gap-1"><span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/15 sm:size-6 sm:rounded-lg">{icon}</span><span className="text-right text-[8px] font-black uppercase leading-[1.15] tracking-[0.06em] opacity-65 sm:text-[9px]">{label}</span></div><p className="mt-1.5 text-lg font-black tracking-[-0.07em] sm:mt-2 sm:text-2xl">{value}</p><p className="mt-0.5 truncate text-[9px] font-semibold leading-3 opacity-70 sm:text-[10px]">{helper}</p></article>;
}

function LeadCard({ lead, defaultExpanded = false, onDeleted }: { lead: Lead; defaultExpanded?: boolean; onDeleted?: (leadId: string) => void }) {
  const router = useRouter();
  const message = encodeURIComponent(`Hola ${lead.fullName.split(" ")[0]}, soy tu asesor. Gracias por visitarnos; te escribo para seguir con la información de tu ${lead.carModel}.`);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatus>(lead.whatsappStatus);
  const [conversationState, setConversationState] = useState<ConversationState>(lead.conversationState);
  const [followUpActions, setFollowUpActions] = useState<FollowUpAction[]>(lead.followUpActions);
  const [actionType, setActionType] = useState<NextActionType>(getNextOpenAction(lead)?.actionType ?? "CALL");
  const [days, setDays] = useState("3");
  const [actionNote, setActionNote] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isDeleting, setIsDeleting] = useState(false);

  const openActions = followUpActions.filter(isOpenAction);
  const dueActions = openActions.filter(isDueAction);
  const isReminderDue = dueActions.length > 0;
  const canSend = whatsappStatus === "PENDING" || whatsappStatus === "FAILED";

  function patchActions(actions: FollowUpAction[]) {
    setFollowUpActions(actions);
    updateLocalLead(lead.id, { followUpActions: actions });
  }

  async function sendMessage() {
    if (isSending || !canSend) return;
    setIsSending(true);
    setSendError(null);
    setSendInfo(null);
    const response = await sendLeadWhatsappAction({ leadId: lead.id, fullName: lead.fullName, phone: lead.phone, carModel: lead.carModel });
    if (response.success && response.data) {
      setWhatsappStatus(response.data.whatsappStatus);
      setConversationState("WAITING_CUSTOMER");
      updateLocalLead(lead.id, { whatsappStatus: response.data.whatsappStatus, conversationState: "WAITING_CUSTOMER", lastAgentMessageAt: new Date().toISOString() });
      setSendInfo(response.warning || "Mensaje enviado automáticamente por WhatsApp. Los estados se actualizarán desde Evolution.");
    } else {
      setSendError(response.error || "No fue posible enviar el mensaje.");
    }
    setIsSending(false);
  }

  async function scheduleAction() {
    if (isScheduling) return;
    setIsScheduling(true);
    setSendError(null);
    setSendInfo(null);
    const response = await scheduleLeadActionAction({ leadId: lead.id, actionType, days: Number(days), note: actionNote });
    if (response.success && response.data) {
      const nextActions = [...followUpActions, response.data.action];
      patchActions(nextActions);
      setConversationState("WAITING_CUSTOMER");
      updateLocalLead(lead.id, { conversationState: "WAITING_CUSTOMER", nextActionAt: response.data.nextActionAt, nextActionType: response.data.actionType });
      setActionNote("");
      setSendInfo(`Recordatorio agregado: ${formatNextActionDate(response.data.nextActionAt)}. Puedes programar otro para el mismo lead.`);
    } else {
      setSendError(response.error || "No pudimos programar el recordatorio.");
    }
    setIsScheduling(false);
  }

  async function updateAction(actionId: string, status: "DONE" | "POSTPONED" | "IGNORED") {
    if (busyActionId) return;
    setBusyActionId(actionId);
    setSendError(null);
    const response = await updateFollowUpActionAction({ actionId, status, postponeDays: status === "POSTPONED" ? 1 : undefined });
    if (response.success && response.data) {
      const nextActions = followUpActions.map((action) => action.id === actionId ? response.data!.action : action);
      patchActions(nextActions);
      setSendInfo(status === "DONE" ? "Acción marcada como hecha." : status === "POSTPONED" ? "Acción pospuesta para mañana." : "Acción ignorada; no volverá a alertarte.");
      router.refresh();
    } else {
      setSendError(response.error || "No pudimos actualizar ese recordatorio.");
    }
    setBusyActionId(null);
  }

  async function ignoreAllOpenActions() {
    if (!openActions.length) return;
    const response = await clearLeadActionAction(lead.id);
    if (response.success) {
      const now = new Date().toISOString();
      patchActions(followUpActions.map((action) => isOpenAction(action) ? { ...action, status: "IGNORED", completedAt: now, note: "Pendiente ignorado por el vendedor." } : action));
      updateLocalLead(lead.id, { nextActionAt: null, nextActionType: null });
      setSendInfo("Pendientes ignorados. No volverán a generar alertas.");
      router.refresh();
    } else {
      setSendError(response.error || "No pudimos actualizar el seguimiento.");
    }
  }

  async function changeConversationState(state: ConversationState) {
    const response = await updateLeadConversationAction({ leadId: lead.id, state });
    if (response.success) {
      setConversationState(state);
      updateLocalLead(lead.id, { conversationState: state });
      setSendInfo(state === "CLOSED" ? "Conversación cerrada. Puedes reabrirla cuando lo necesites." : "Conversación reabierta.");
      router.refresh();
    } else {
      setSendError(response.error || "No pudimos actualizar la conversación.");
    }
  }

  async function deleteContact() {
    if (isDeleting || !window.confirm(`¿Eliminar a ${lead.fullName}? Se ocultará de la lista y dejará de generar recordatorios.`)) return;
    setIsDeleting(true);
    const response = await deleteLeadAction(lead.id);
    if (response.success) {
      removeLocalLead(lead.id);
      onDeleted?.(lead.id);
      router.refresh();
    } else {
      setSendError(response.error || "No pudimos eliminar este contacto.");
      setIsDeleting(false);
    }
  }

  return <article className={`rounded-[20px] border bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,0.04)] transition hover:shadow-[0_12px_30px_rgba(16,24,40,0.07)] sm:p-3.5 ${conversationState === "ACTIVE" ? "border-[#75c88b] ring-1 ring-[#75c88b]/20" : isReminderDue ? "border-[#f3b257] ring-1 ring-[#f3b257]/20" : "border-black/[0.06]"}`}>
    <div className="compact-lead-header flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0eee8] text-xs font-black">{lead.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h3 className="truncate text-sm font-black">{lead.fullName}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${temperatureClasses(lead.temperature)}`}>{lead.temperature === "HIGH" ? "🔥 " : ""}{getTemperatureLabel(lead.temperature)}</span></div><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{lead.carModel} <span className="mx-1 text-black/20">·</span> {getStatusLabel(lead.status)} <span className="mx-1 text-black/20">·</span> {formatRelativeDate(lead.createdAt)}</p><div className="mt-1.5 flex flex-wrap gap-1"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${conversationClasses(conversationState)}`}>{getConversationStateLabel(conversationState)}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${whatsappStatusClasses(whatsappStatus)}`}>{getWhatsappStatusLabel(whatsappStatus)}</span>{isReminderDue ? <span className="rounded-full bg-[#fff8ed] px-1.5 py-0.5 text-[9px] font-black text-[#b94910]">Para hoy</span> : null}</div></div></div>
      <div className="flex items-center gap-1.5 sm:shrink-0"><span className="mr-auto rounded-lg bg-[#f6f3ed] px-2 py-1.5 text-center sm:mr-1"><strong className="block text-base font-black leading-none">{lead.score}</strong><span className="text-[8px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">score</span></span><a aria-label={`Llamar a ${lead.fullName}`} href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="icon-action" title="Llamar"><Phone size={15} /></a><button type="button" aria-label={`Enviar WhatsApp a ${lead.fullName}`} onClick={sendMessage} disabled={isSending || !canSend} className={`send-whatsapp-button ${!canSend ? "send-whatsapp-button-sent" : ""}`} title={!canSend ? getWhatsappStatusLabel(whatsappStatus) : "Enviar WhatsApp automáticamente"}>{isSending ? <LoaderCircle size={15} className="animate-spin" /> : !canSend ? <CheckCircle2 size={15} /> : <Send size={15} />}<span className="hidden sm:inline">{isSending ? "Enviando" : !canSend ? getWhatsappStatusLabel(whatsappStatus) : "Enviar"}</span></button><a aria-label={`Abrir WhatsApp manual para ${lead.fullName}`} href={`https://wa.me/${formatPhoneForWhatsapp(lead.phone)}?text=${message}`} target="_blank" rel="noreferrer" className="icon-action icon-action-whatsapp" title="Abrir WhatsApp manual"><MessageCircle size={15} /></a><button type="button" aria-expanded={isExpanded} aria-label={isExpanded ? `Ocultar detalles de ${lead.fullName}` : `Mostrar detalles de ${lead.fullName}`} onClick={() => setIsExpanded((current) => !current)} className="icon-action" title={isExpanded ? "Ocultar detalles" : "Ver detalles"}>{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></div>
    </div>

    {isExpanded && lead.lastMessageDirection ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f6f3ed] px-2.5 py-2 text-[11px]"><p className="min-w-0 truncate text-[var(--muted)]"><strong className="text-[var(--ink)]">{lead.lastMessageDirection === "INBOUND" ? "Último mensaje · Cliente:" : "Último mensaje · Tú:"}</strong> {lead.lastMessagePreview || "Mensaje sin texto"}</p>{conversationState === "ACTIVE" ? <button type="button" onClick={() => changeConversationState("CLOSED")} className="shrink-0 font-black text-[var(--muted)] hover:text-[var(--ink)]">Cerrar conversación</button> : conversationState === "CLOSED" ? <button type="button" onClick={() => changeConversationState("ACTIVE")} className="shrink-0 font-black text-[#18733a]">Reabrir</button> : null}</div> : null}

    {isExpanded ? <div className="compact-follow-up mt-3 rounded-2xl bg-[#faf9f6] p-2.5">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black"><CalendarClock size={15} />Seguimiento del lead</div>{openActions.length ? <button type="button" onClick={ignoreAllOpenActions} className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)]">Ignorar pendientes</button> : null}</div>
      {followUpActions.length ? <div className="mt-3 space-y-2">{followUpActions.map((action) => {
        const due = isDueAction(action);
        return <div key={action.id} className={`rounded-xl border px-3 py-2.5 ${due ? "border-[#f3b257] bg-[#fff8ed]" : "border-black/[0.06] bg-white"}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${actionStatusClasses(action.status)}`}>{getFollowUpActionStatusLabel(action.status)}</span><span className={`text-xs font-black ${due ? "text-[#b94910]" : "text-[var(--ink)]"}`}>{due ? "Para hoy · " : ""}{getNextActionLabel(action.actionType)}</span><span className="text-[11px] text-[var(--muted)]">{formatNextActionDate(action.scheduledFor)}</span></div>{action.note ? <p className="mt-1 line-clamp-1 text-[11px] text-[var(--muted)]">{action.note}</p> : null}</div>{isOpenAction(action) ? <div className="flex flex-wrap gap-1.5"><button type="button" disabled={busyActionId === action.id} onClick={() => updateAction(action.id, "DONE")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#e4f8e9] px-2.5 text-[11px] font-black text-[#18733a] disabled:opacity-50"><Check size={13} />Hecha</button><button type="button" disabled={busyActionId === action.id} onClick={() => updateAction(action.id, "POSTPONED")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#edf3ff] px-2.5 text-[11px] font-black text-[#3c5f9b] disabled:opacity-50"><RotateCcw size={13} />+1 día</button><button type="button" disabled={busyActionId === action.id} onClick={() => updateAction(action.id, "IGNORED")} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#f1f1f1] px-2.5 text-[11px] font-black text-[#777c86] disabled:opacity-50"><Ban size={13} />Ignorar</button></div> : null}</div>
        </div>;
      })}</div> : <p className="mt-2 text-xs font-semibold text-[var(--muted)]">No hay acciones programadas todavía.</p>}
      <div className="mt-3 flex flex-col gap-2 border-t border-black/[0.06] pt-3 sm:flex-row sm:flex-wrap sm:items-center"><span className="flex items-center gap-1.5 text-[11px] font-black text-[var(--muted)]"><Plus size={14} />Agregar acción</span><select aria-label="Tipo de siguiente acción" value={actionType} onChange={(event) => setActionType(event.target.value as NextActionType)} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-bold"><option value="CALL">Llamar</option><option value="WHATSAPP">WhatsApp</option><option value="QUOTE">Cotizar</option><option value="OTHER">Otra</option></select><select aria-label="Días para el recordatorio" value={days} onChange={(event) => setDays(event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs font-bold"><option value="1">Mañana</option><option value="3">En 3 días</option><option value="7">En 7 días</option><option value="14">En 14 días</option></select><input value={actionNote} onChange={(event) => setActionNote(event.target.value)} placeholder="Nota opcional" className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 text-xs font-semibold outline-none placeholder:text-[#9a9b9b]" /><button type="button" onClick={scheduleAction} disabled={isScheduling} className="h-9 rounded-lg bg-[var(--ink)] px-3 text-xs font-black text-white disabled:opacity-60">{isScheduling ? "Guardando" : "Programar"}</button></div>
    </div> : null}
    {isExpanded && lead.lastCustomerMessageAt ? <p className="mt-3 text-[11px] text-[var(--muted)]">Última respuesta del cliente registrada. Las acciones pendientes se cancelan cuando llega una nueva respuesta.</p> : null}
    {isExpanded && <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3"><span className="text-[11px] text-[var(--muted)]">Se ocultará de la lista y dejará de generar recordatorios.</span><button type="button" onClick={deleteContact} disabled={isDeleting} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-[#b33a2c] hover:bg-[#fff0ee] disabled:opacity-50"><Trash2 size={14} />{isDeleting ? "Eliminando" : "Eliminar contacto"}</button></div>}
    {isExpanded && sendError ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-red-600"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{sendError}</p> : null}{isExpanded && sendInfo ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />{sendInfo}</p> : null}
  </article>;
}
