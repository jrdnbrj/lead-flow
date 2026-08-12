"use client";

import * as XLSX from "xlsx";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, Flame, LoaderCircle, MessageCircle, Phone, RefreshCw, Search, Send, SlidersHorizontal, Target, Trash2, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import type { ConversationState, FollowUpAction, InboundClassification, Lead, LeadStatus, LeadTemperature, WhatsappStatus } from "@/lib/domain/lead";
import { formatPhoneForWhatsapp, getConversationStateLabel, getNextActionLabel, getStatusLabel, getTemperatureLabel, getWhatsappStatusLabel } from "@/lib/domain/lead";
import { correctInboundResponseAction, deleteLeadAction, recordPurchaseDecisionAction, sendLeadWhatsappAction, updateLeadConversationAction } from "@/lib/leads/actions";
import { formatNextActionDate, getDashboardLeadBucket, isLeadReminderDue, sortLeadsForDashboard } from "@/lib/leads/follow-up";
import { FollowUpActions } from "@/components/leads/follow-up-actions";
import { FirstContactSummary } from "@/components/leads/first-contact-summary";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type TemperatureFilter = "ALL" | LeadTemperature;
type StatusFilter = "ALL" | LeadStatus;
type TradeInFilter = "ALL" | "YES" | "NO";
type RealtimeState = "connecting" | "live" | "error";

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Todos los estados" },
  { value: "NUEVO", label: "Nuevos" },
  { value: "CONTACTADO", label: "Contactados" },
  { value: "COTIZADO", label: "Cotizados" },
];

function WhatsAppLogo({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#25D366" />
      <path d="m7.45 17.1.75-2.25a7.3 7.3 0 1 1 2.05 1.55l-2.8.7Z" fill="#25D366" stroke="#fff" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M9.2 8.8c.2-.3.46-.34.75-.2l1.1.54c.22.1.3.3.24.54l-.28.95c-.06.2-.02.35.1.5.45.54.96.99 1.55 1.33.16.1.3.1.48.02l.9-.4c.2-.1.38-.04.5.14l.68.93c.15.21.13.42-.07.58-.38.32-.82.5-1.3.48-1.05-.04-2.16-.67-3.02-1.45-.87-.78-1.5-1.78-1.77-2.58-.17-.5-.1-.93.14-1.18Z" fill="#fff" />
    </svg>
  );
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

function isOpenAction(action: FollowUpAction): boolean { return action.status === "PENDING" || action.status === "POSTPONED"; }

function isDueAction(action: FollowUpAction): boolean {
  return isOpenAction(action) && isLeadReminderDue(action.scheduledFor);
}

function getNextOpenAction(lead: Lead): FollowUpAction | null {
  return lead.followUpActions.filter(isOpenAction).sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0] ?? null;
}

function inboundClassificationLabel(classification: InboundClassification): string { return { NO_SUGGESTION: "Sin respuesta sugerida", PENDING: "Respuesta pendiente", REVIEW: "Revisar" }[classification]; }
function inboundClassificationClasses(classification: InboundClassification): string { return { NO_SUGGESTION: "bg-[#edf0f4] text-[#59616d]", PENDING: "bg-[#fff0bd] text-[#765000]", REVIEW: "bg-[#f4eaff] text-[#6c3d91]" }[classification]; }

export function DashboardClient({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter();
  const [temperature, setTemperature] = useState<TemperatureFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [tradeIn, setTradeIn] = useState<TradeInFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hiddenLeadIds, setHiddenLeadIds] = useState<string[]>([]);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>(() => process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "connecting" : "error");
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => startRefresh(() => router.refresh()), 150);
    };
    const channel = supabase
      .channel("leadflow-dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_follow_up_actions" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeState("error");
      });
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router]);

function refreshAllLeads() {
  startRefresh(() => router.refresh());
}

  const leads = useMemo(() => {
    return initialLeads.filter((lead) => !hiddenLeadIds.includes(lead.id));
  }, [hiddenLeadIds, initialLeads]);

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const matchesTemperature = temperature === "ALL" || lead.temperature === temperature;
    const matchesStatus = status === "ALL" || lead.status === status;
    const matchesTradeIn = tradeIn === "ALL" || (tradeIn === "YES" ? lead.tradeInCar : !lead.tradeInCar);
    const normalizedQuery = query.toLowerCase().trim();
    const matchesQuery = !normalizedQuery || `${lead.fullName} ${lead.phone} ${lead.carModel}`.toLowerCase().includes(normalizedQuery);
    return matchesTemperature && matchesStatus && matchesTradeIn && matchesQuery;
  }), [leads, query, status, temperature, tradeIn]);

  const orderedLeads = sortLeadsForDashboard(filteredLeads);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(orderedLeads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleLeads = orderedLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleActiveLeads = visibleLeads.filter((lead) => getDashboardLeadBucket(lead) === 0);
  const visibleReminderLeads = visibleLeads.filter((lead) => getDashboardLeadBucket(lead) === 1);
  const visibleNoActionLeads = visibleLeads.filter((lead) => getDashboardLeadBucket(lead) === 2);
  const visibleRemainingLeads = visibleLeads.filter((lead) => getDashboardLeadBucket(lead) === 3);
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
          <button type="button" onClick={refreshAllLeads} disabled={isRefreshing} className="button-secondary" aria-label="Actualizar todos los contactos" title="Volver a consultar todos los contactos en Supabase"><RefreshCw size={17} className={isRefreshing ? "animate-spin" : ""} />{isRefreshing ? "Actualizando" : "Actualizar datos"}</button>
          <button type="button" onClick={exportToXlsx} className="button-secondary"><Download size={17} />Exportar XLSX</button>
        </div>
      </section>

      <p className={`-mt-4 flex items-center gap-1.5 text-xs font-bold ${realtimeState === "live" ? "text-[#18733a]" : realtimeState === "error" ? "text-[#b33a2c]" : "text-[var(--muted)]"}`} aria-live="polite">
        <span className={`size-1.5 rounded-full ${realtimeState === "live" ? "bg-[#39a85c]" : realtimeState === "error" ? "bg-[#d25445]" : "bg-[#d5a82f]"}`} />
        {realtimeState === "live" ? "Actualización automática activa" : realtimeState === "error" ? "Actualización automática no disponible; usa Actualizar datos" : "Conectando actualización automática…"}
      </p>

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
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {([{ value: "ALL", label: "Parte de pago: todos" }, { value: "YES", label: "Con vehículo" }, { value: "NO", label: "Sin vehículo" }] as const).map((filter) => <button type="button" key={filter.value} onClick={() => { setTradeIn(filter.value); setPage(1); }} className={`filter-pill ${tradeIn === filter.value ? "filter-pill-active-muted" : ""}`}>{filter.label}</button>)}
        </div>
      </section>

      {filteredLeads.length ? <Pagination currentPage={currentPage} totalPages={totalPages} visibleCount={visibleLeads.length} totalCount={filteredLeads.length} onPageChange={setPage} /> : null}
      {visibleActiveLeads.length ? <LeadSection title="Conversaciones activas" helper="Responde primero: el cliente ya está hablando contigo." leads={visibleActiveLeads} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleReminderLeads.length ? <LeadSection title="Vencidos o para hoy" helper="La alerta permanece visible hasta resolverla." leads={visibleReminderLeads} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleNoActionLeads.length ? <LeadSection title="Sin próxima acción" helper="Estos leads están listos para que definas el siguiente paso." leads={visibleNoActionLeads} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleRemainingLeads.length ? <LeadSection title="Resto de contactos" helper="Seguimientos futuros y conversaciones pendientes." leads={visibleRemainingLeads} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {!visibleLeads.length ? <div className="rounded-[22px] border border-dashed border-black/15 bg-white px-5 py-12 text-center"><Search className="mx-auto text-[var(--muted)]" size={28} /><h3 className="mt-4 font-black">No hay contactos con esos filtros</h3><p className="mt-1 text-sm text-[var(--muted)]">Prueba otra búsqueda o captura un nuevo prospecto.</p></div> : null}
      {filteredLeads.length > pageSize ? <Pagination currentPage={currentPage} totalPages={totalPages} visibleCount={visibleLeads.length} totalCount={filteredLeads.length} onPageChange={setPage} /> : null}
    </div>
  );
}

function LeadSection({ title, helper, leads, onDeleted }: { title: string; helper: string; leads: Lead[]; onDeleted: (leadId: string) => void }) {
  return <section className="space-y-2.5"><div><div className="flex items-center justify-between"><h2 className="text-lg font-black tracking-[-0.04em]">{title}</h2><span className="text-xs font-bold text-[var(--muted)]">{leads.length}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{helper}</p></div>{leads.map((lead) => <LeadCard key={lead.id} lead={lead} onDeleted={onDeleted} />)}</section>;
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
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatus>(lead.whatsappStatus);
  const [conversationState, setConversationState] = useState<ConversationState>(lead.conversationState);
  const [followUpActions, setFollowUpActions] = useState<FollowUpAction[]>(lead.followUpActions);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [manualDecision, setManualDecision] = useState<Lead["inboundManualDecision"]>(lead.inboundManualDecision);
  const [isCorrectingInbound, setIsCorrectingInbound] = useState(false);
  const [purchaseDecisionAt, setPurchaseDecisionAt] = useState(lead.purchaseDecisionAt);
  const [isPurchaseConfirming, setIsPurchaseConfirming] = useState(false);
  const [isRecordingPurchase, setIsRecordingPurchase] = useState(false);
  const [, startStateSync] = useTransition();

  useEffect(() => {
    startStateSync(() => {
      setWhatsappStatus(lead.whatsappStatus);
      setConversationState(lead.conversationState);
      setFollowUpActions(lead.followUpActions);
      setManualDecision(lead.inboundManualDecision);
      setPurchaseDecisionAt(lead.purchaseDecisionAt);
    });
  }, [lead.conversationState, lead.followUpActions, lead.whatsappStatus, lead.inboundManualDecision, lead.purchaseDecisionAt]);

  const isReminderDue = followUpActions.some(isDueAction);
  const canSend = whatsappStatus === "PENDING" || whatsappStatus === "FAILED";
  const nextOpenAction = getNextOpenAction({ ...lead, followUpActions });
  const inboundClassification = lead.inboundClassification;

  async function recordPurchaseDecision() {
    if (isRecordingPurchase || purchaseDecisionAt) return;
    setIsRecordingPurchase(true);
    setSendError(null);
    const response = await recordPurchaseDecisionAction({ leadId: lead.id });
    if (response.success && response.data) {
      setPurchaseDecisionAt(response.data.recordedAt);
      setIsPurchaseConfirming(false);
      setSendInfo("Compra registrada. El estado comercial y el seguimiento no cambiaron.");
      router.refresh();
    } else {
      setSendError(response.error || "No pudimos registrar la decisión. Puedes reintentarlo.");
    }
    setIsRecordingPurchase(false);
  }

  async function correctInbound(decision: "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED") {
    if (isCorrectingInbound || !inboundClassification) return;
    setIsCorrectingInbound(true);
    setSendError(null);
    setSendInfo(null);
    const responseAction = followUpActions.find((action) => action.actionType === "RESPONSE" && isOpenAction(action));
    const response = await correctInboundResponseAction({ leadId: lead.id, decision, sourceMessageId: decision === "REQUIRES_RESPONSE" ? lead.lastInboundMessageId ?? undefined : undefined, actionId: responseAction?.id, expectedActionVersion: responseAction?.actionVersion });
    if (response.success && response.data) {
      setManualDecision(decision);
      if (response.data.action) setFollowUpActions((current) => {
        const withoutOtherOpenResponse = current.filter((action) => !(action.actionType === "RESPONSE" && isOpenAction(action) && action.id !== response.data!.action!.id));
        const exists = withoutOtherOpenResponse.some((action) => action.id === response.data!.action!.id);
        return exists ? withoutOtherOpenResponse.map((action) => action.id === response.data!.action!.id ? response.data!.action! : action) : [...withoutOtherOpenResponse, response.data!.action!];
      });
      setSendInfo(decision === "REQUIRES_RESPONSE" ? "Marcado como respuesta pendiente." : "Marcado como no requiere respuesta.");
      router.refresh();
    } else setSendError(response.error || "No pudimos aplicar la corrección. Puedes reintentarlo.");
    setIsCorrectingInbound(false);
  }

  async function sendMessage() {
    if (isSending || !canSend) return;
    setIsSending(true);
    setSendError(null);
    setSendInfo(null);
    const response = await sendLeadWhatsappAction({ leadId: lead.id, fullName: lead.fullName, phone: lead.phone, carModels: lead.carModels });
    if (response.success && response.data) {
      setWhatsappStatus(response.data.whatsappStatus);
      if (response.data.whatsappStatus === "SENT") setConversationState("WAITING_CUSTOMER");
      setSendInfo(response.warning || "Mensaje enviado automáticamente por WhatsApp. Los estados se actualizarán desde Evolution.");
    } else {
      setSendError(response.message || response.error || "No fue posible enviar el mensaje.");
    }
    setIsSending(false);
  }

  async function changeConversationState(state: ConversationState) {
    const response = await updateLeadConversationAction({ leadId: lead.id, state });
    if (response.success) {
      setConversationState(state);
      setSendInfo(state === "CLOSED" ? "Conversación cerrada. Puedes reabrirla cuando lo necesites." : "Conversación reabierta.");
      router.refresh();
    } else {
      setSendError(response.message || response.error || "No pudimos actualizar la conversación.");
    }
  }

  async function deleteContact() {
    if (isDeleting) return;
    setIsDeleting(true);
    const response = await deleteLeadAction(lead.id);
    if (response.success) {
      onDeleted?.(lead.id);
      setIsDeleteModalOpen(false);
      router.refresh();
    } else {
      setSendError(response.message || response.error || "No pudimos eliminar este contacto.");
      setIsDeleting(false);
    }
  }

  const toggleExpanded = () => setIsExpanded((current) => !current);

  return <article onClick={() => { if (!isExpanded) setIsExpanded(true); }} className={`rounded-[20px] border bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,0.04)] transition hover:shadow-[0_12px_30px_rgba(16,24,40,0.07)] ${!isExpanded ? "cursor-pointer" : ""} sm:p-3.5 ${conversationState === "ACTIVE" ? "border-[#75c88b] ring-1 ring-[#75c88b]/20" : isReminderDue ? "border-[#f3b257] ring-1 ring-[#f3b257]/20" : "border-black/[0.06]"}`}>
    <div onClick={toggleExpanded} className="compact-lead-header flex cursor-pointer flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0eee8] text-xs font-black">{lead.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h3 className="truncate text-sm font-black">{lead.fullName}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${temperatureClasses(lead.temperature)}`}>{lead.temperature === "HIGH" ? "🔥 " : ""}{getTemperatureLabel(lead.temperature)}</span></div><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{lead.carModel} <span className="mx-1 text-black/20">·</span> {getStatusLabel(lead.status)} <span className="mx-1 text-black/20">·</span> {formatRelativeDate(lead.createdAt)}</p><div className="mt-1.5 flex flex-wrap gap-1"><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${conversationClasses(conversationState)}`}>{getConversationStateLabel(conversationState)}</span><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${whatsappStatusClasses(whatsappStatus)}`}>{getWhatsappStatusLabel(whatsappStatus)}</span>{lead.tradeInCar ? <span className="rounded-full bg-[#e7edf9] px-1.5 py-0.5 text-[9px] font-black text-[#3c5f9b]">Parte de pago</span> : null}{isReminderDue ? <span className="rounded-full bg-[#fff8ed] px-1.5 py-0.5 text-[9px] font-black text-[#b94910]">Para hoy</span> : null}</div><p className="mt-1 truncate text-[11px] font-bold text-[var(--muted)]">{nextOpenAction ? `Próxima acción: ${getNextActionLabel(nextOpenAction.actionType)} · ${formatNextActionDate(nextOpenAction.scheduledFor) ?? "sin fecha"}` : "Sin próxima acción"}</p></div></div>
      <div className="flex items-center gap-1.5 sm:shrink-0"><span className="mr-auto rounded-lg bg-[#f6f3ed] px-2 py-1.5 text-center sm:mr-1"><strong className="block text-base font-black leading-none">{lead.score}</strong><span className="text-[8px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">score</span></span><a onClick={(event) => event.stopPropagation()} aria-label={`Llamar a ${lead.fullName}`} href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="icon-action icon-action-phone" title="Llamar"><Phone size={15} /></a><button type="button" aria-label={`Enviar WhatsApp a ${lead.fullName}`} onClick={(event) => { event.stopPropagation(); void sendMessage(); }} disabled={isSending || !canSend} className={`send-whatsapp-button ${!canSend ? "send-whatsapp-button-sent" : ""}`} title={!canSend ? "Mensaje automático ya enviado" : whatsappStatus === "FAILED" ? "Reintentar envío automático" : "Enviar WhatsApp automáticamente"}>{isSending ? <LoaderCircle size={15} className="animate-spin" /> : !canSend ? <CheckCircle2 size={15} /> : <Send size={15} />}<span className="hidden sm:inline">{isSending ? "Enviando" : !canSend ? "Enviado" : whatsappStatus === "FAILED" ? "Reintentar" : "Enviar"}</span></button><a onClick={(event) => event.stopPropagation()} aria-label={`Abrir WhatsApp manual para ${lead.fullName}`} href={`https://wa.me/${formatPhoneForWhatsapp(lead.phone)}`} target="_blank" rel="noreferrer" className="icon-action icon-action-whatsapp" title="Abrir chat de WhatsApp"><WhatsAppLogo /></a><button type="button" aria-expanded={isExpanded} aria-label={isExpanded ? `Ocultar detalles de ${lead.fullName}` : `Mostrar detalles de ${lead.fullName}`} onClick={(event) => { event.stopPropagation(); toggleExpanded(); }} className="icon-action" title={isExpanded ? "Ocultar detalles" : "Ver detalles"}>{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button></div>
    </div>

    {isExpanded && lead.lastMessageDirection ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f6f3ed] px-2.5 py-2 text-[11px]"><p className="min-w-0 truncate text-[var(--muted)]"><strong className="text-[var(--ink)]">{lead.lastMessageDirection === "INBOUND" ? "Último mensaje · Cliente:" : "Último mensaje · Tú:"}</strong> {lead.lastMessagePreview || "Mensaje sin texto"}</p>{conversationState === "ACTIVE" ? <button type="button" onClick={() => changeConversationState("CLOSED")} className="shrink-0 font-black text-[var(--muted)] hover:text-[var(--ink)]">Cerrar conversación</button> : conversationState === "CLOSED" ? <button type="button" onClick={() => changeConversationState("ACTIVE")} className="shrink-0 font-black text-[#18733a]">Reabrir</button> : null}</div> : null}

    {isExpanded && inboundClassification ? <section className="mt-3 rounded-2xl border border-[#dce5ef] bg-[#f8fbff] p-3" aria-label="Estado inbound"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Clasificación inbound</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${inboundClassificationClasses(inboundClassification)}`}>{manualDecision === "REQUIRES_RESPONSE" ? "Respuesta pendiente" : manualDecision === "NO_RESPONSE_REQUIRED" ? "No requiere respuesta" : inboundClassificationLabel(inboundClassification)}</span></div><p className="text-[10px] font-semibold text-[var(--muted)]">{lead.lastInboundMessageAt ? formatRelativeDate(lead.lastInboundMessageAt) : "Sin fecha"}</p></div><p className="mt-2 text-xs leading-5 text-[var(--ink)]">{lead.lastInboundMessagePreview || "Mensaje sin texto"}</p>{inboundClassification !== "NO_SUGGESTION" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={isCorrectingInbound} onClick={() => void correctInbound("REQUIRES_RESPONSE")} className="button-primary min-h-9 px-3 py-2 text-[11px]">{isCorrectingInbound ? "Guardando…" : "Sí requiere respuesta"}</button><button type="button" disabled={isCorrectingInbound} onClick={() => void correctInbound("NO_RESPONSE_REQUIRED")} className="button-secondary min-h-9 px-3 py-2 text-[11px]">No requiere respuesta</button></div> : null}</section> : null}

    {isExpanded ? <section className="mt-3 rounded-2xl border border-[#e6dfd0] bg-[#fffdf8] p-3" aria-label="Decisión de compra"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Compra</p><p className="mt-1 text-sm font-black">{purchaseDecisionAt ? "Compra registrada" : "Aún no registrada"}</p>{purchaseDecisionAt ? <p className="mt-1 text-[11px] text-[var(--muted)]">Registrada el {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil" }).format(new Date(purchaseDecisionAt))}</p> : null}</div>{!purchaseDecisionAt && !isPurchaseConfirming ? <button type="button" onClick={() => setIsPurchaseConfirming(true)} className="button-secondary min-h-9 px-3 py-2 text-[11px]">Cliente decidió comprar</button> : null}</div>{isPurchaseConfirming ? <div className="mt-3 rounded-xl border border-[#ead7a8] bg-[#fff8df] p-3"><p className="text-xs font-bold">¿Registrar esta decisión con la fecha y hora de ahora?</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={isRecordingPurchase} onClick={() => void recordPurchaseDecision()} className="button-primary min-h-9 px-3 py-2 text-[11px]">{isRecordingPurchase ? "Registrando…" : "Registrar"}</button><button type="button" disabled={isRecordingPurchase} onClick={() => setIsPurchaseConfirming(false)} className="button-secondary min-h-9 px-3 py-2 text-[11px]">Cancelar</button></div></div> : null}</section> : null}

    {isExpanded ? <FollowUpActions leadId={lead.id} actions={followUpActions} onActionsChange={(actions) => { setFollowUpActions(actions); router.refresh(); }} onConversationWaiting={() => setConversationState("WAITING_CUSTOMER")} onError={setSendError} onInfo={setSendInfo} /> : null}
    {isExpanded ? <FirstContactSummary lead={lead} initialOperation={lead.firstContact} /> : null}
    {isExpanded && lead.lastCustomerMessageAt ? <p className="mt-3 text-[11px] text-[var(--muted)]">Última respuesta del cliente registrada. Las acciones pendientes se cancelan cuando llega una nueva respuesta.</p> : null}
    {isExpanded && <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3"><span className="text-[11px] text-[var(--muted)]">Se ocultará de la lista y dejará de generar recordatorios.</span><button type="button" onClick={(event) => { event.stopPropagation(); setIsDeleteModalOpen(true); setSendError(null); }} disabled={isDeleting} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-[#b33a2c] hover:bg-[#fff0ee] disabled:opacity-50"><Trash2 size={14} />Eliminar contacto</button></div>}
    {isExpanded && sendError ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-red-600"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{sendError}</p> : null}{isExpanded && sendInfo ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />{sendInfo}</p> : null}
    {isDeleteModalOpen ? <div role="presentation" onClick={(event) => { event.stopPropagation(); if (!isDeleting) setIsDeleteModalOpen(false); }} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby={`delete-title-${lead.id}`} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[26px] border border-black/[0.08] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.24)] sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0ee] text-[#b33a2c]"><Trash2 size={18} /></span><div><h2 id={`delete-title-${lead.id}`} className="text-lg font-black">¿Eliminar a {lead.fullName}?</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">El contacto se ocultará del resumen, dejará de generar recordatorios y no se eliminarán físicamente sus datos. Podrás conservarlo para auditoría.</p></div></div>{sendError ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{sendError}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting} className="button-secondary">Cancelar</button><button type="button" onClick={() => void deleteContact()} disabled={isDeleting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#b33a2c] px-4 text-sm font-black text-white disabled:opacity-60"><Trash2 size={16} />{isDeleting ? "Eliminando" : "Eliminar contacto"}</button></div></div></div> : null}
  </article>;
}
