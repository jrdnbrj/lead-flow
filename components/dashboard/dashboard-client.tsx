"use client";

import * as XLSX from "xlsx";
import { CheckCircle2, ChevronDown, ChevronUp, CircleDollarSign, Download, FileText, LoaderCircle, Phone, RefreshCw, Search, Send, SlidersHorizontal, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import type { ConversationState, FollowUpAction, InboundClassification, Lead, LeadStatus, LeadTemperature, WhatsappStatus } from "@/lib/domain/lead";
import { formatPhoneForWhatsapp, getConversationStateLabel, getNextActionLabel, getStatusLabel, getTemperatureLabel, leadTimeframes, paymentMethods } from "@/lib/domain/lead";
import { correctInboundResponseAction, deleteLeadAction, recordPurchaseDecisionAction, sendLeadWhatsappAction, updateLeadConversationAction } from "@/lib/leads/actions";
import { formatNextActionDate, getDashboardLeadBucket, isLeadReminderDue, sortLeadsForDashboard } from "@/lib/leads/follow-up";
import { FollowUpActions } from "@/components/leads/follow-up-actions";
import { FirstContactSummary } from "@/components/leads/first-contact-summary";
import { LeadContactActions } from "@/components/leads/lead-contact-actions";
import { PendingNotifications } from "@/components/leads/pending-notifications";
import { PushNotifications } from "@/components/leads/push-notifications";
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

function WhatsAppLogo({ size = 20 }: { size?: number }) {
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

function isOpenAction(action: FollowUpAction): boolean { return action.status === "PENDING" || action.status === "POSTPONED"; }

function isDueAction(action: FollowUpAction): boolean {
  return isOpenAction(action) && isLeadReminderDue(action.scheduledFor);
}

function getNextOpenAction(lead: Lead): FollowUpAction | null {
  return lead.followUpActions.filter(isOpenAction).sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0] ?? null;
}

function inboundClassificationLabel(classification: InboundClassification): string { return { NO_SUGGESTION: "Sin respuesta sugerida", PENDING: "Respuesta pendiente", REVIEW: "Revisar" }[classification]; }
function inboundClassificationClasses(classification: InboundClassification): string { return { NO_SUGGESTION: "bg-[#edf0f4] text-[#59616d]", PENDING: "bg-[#fff0bd] text-[#765000]", REVIEW: "bg-[#f4eaff] text-[#6c3d91]" }[classification]; }

function getTimeframeLabel(value: Lead["timeframe"]): string {
  return leadTimeframes.find((option) => option.value === value)?.label ?? value;
}

function getPaymentMethodLabel(value: Lead["paymentMethod"]): string {
  return paymentMethods.find((option) => option.value === value)?.label ?? value;
}

export function DashboardClient({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter();
  const [temperature, setTemperature] = useState<TemperatureFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [tradeIn, setTradeIn] = useState<TradeInFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hiddenLeadIds, setHiddenLeadIds] = useState<string[]>([]);
  const [expandedLeadIds, setExpandedLeadIds] = useState<Set<string>>(() => new Set());
  const [realtimeState, setRealtimeState] = useState<RealtimeState>(() => process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "connecting" : "error");
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    let refreshTimer: number | undefined;
    let lastRealtimeEventAt = 0;
    const refresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => startRefresh(() => router.refresh()), 150);
    };
    const onRealtimeChange = () => {
      lastRealtimeEventAt = Date.now();
      refresh();
    };
    const channel = supabase
      .channel("leadflow-dashboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, onRealtimeChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_messages" }, onRealtimeChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_follow_up_actions" }, onRealtimeChange)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtimeState("error");
      });
    const refreshVisibleFallback = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRealtimeEventAt >= 20_000) refresh();
    };
    const fallbackTimer = window.setInterval(refreshVisibleFallback, 15_000);
    const handleVisibilityChange = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [router]);

function refreshAllLeads() {
  startRefresh(() => router.refresh());
}

  function setLeadExpanded(leadId: string, expanded: boolean) {
    setExpandedLeadIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(leadId); else next.delete(leadId);
      return next;
    });
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
    <div className="space-y-3">
      <section className="flex flex-wrap items-center justify-between gap-1.5 border-b border-black/[0.06] pb-1">
        <p className="eyebrow">Panel de ventas · {formatToday()}</p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={refreshAllLeads} disabled={isRefreshing} className="button-secondary min-h-9 px-3 py-1.5 text-xs" aria-label="Actualizar todos los contactos" title="Volver a consultar todos los contactos en Supabase"><RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />{isRefreshing ? "Actualizando" : "Actualizar"}</button>
          <button type="button" onClick={exportToXlsx} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-black text-[var(--muted)] hover:bg-black/[0.04]"><Download size={15} />Exportar</button>
        </div>
      </section>

      <p className="-mt-2 flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]" aria-live="polite">
        <span className={`size-1.5 rounded-full ${realtimeState === "live" ? "bg-[#39a85c]" : realtimeState === "error" ? "bg-[#d25445]" : "bg-[#d5a82f]"}`} />
        {realtimeState === "live" ? "Actualización automática activa" : realtimeState === "error" ? "Actualización automática no disponible; usa Actualizar datos" : "Conectando actualización automática…"}
      </p>

      <PushNotifications />

      <PendingNotifications leads={leads} />
      <section className="rounded-2xl border border-black/[0.06] bg-white p-2 shadow-[0_10px_30px_rgba(16,24,40,0.04)] sm:p-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-black"><SlidersHorizontal size={16} />Contactos <span className="text-xs font-semibold text-[var(--muted)]">{filteredLeads.length} visibles</span></div>
          <label className="flex h-9 w-full items-center gap-2 rounded-xl bg-[#f6f3ed] px-3 text-[var(--muted)] sm:max-w-xs"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar nombre, celular o modelo" className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[#9a9b9b]" /></label>
        </div>
        <details className="group mt-1">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-black text-[var(--muted)] [&::-webkit-details-marker]:hidden">Más filtros <ChevronDown size={14} className="transition group-open:rotate-180" /></summary>
          <div className="space-y-2 pt-1">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((value) => {
            const label = value === "ALL" ? "Todas las prioridades" : value === "HIGH" ? "🔥 Alta" : value === "MEDIUM" ? "Media" : "Baja";
            return <button type="button" key={value} onClick={() => { setTemperature(value); setPage(1); }} className={`filter-pill dashboard-filter-pill ${temperature === value ? "filter-pill-active" : ""}`}>{label}</button>;
          })}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => <button type="button" key={filter.value} onClick={() => { setStatus(filter.value); setPage(1); }} className={`filter-pill dashboard-filter-pill ${status === filter.value ? "filter-pill-active-muted" : ""}`}>{filter.label}</button>)}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([{ value: "ALL", label: "Parte de pago: todos" }, { value: "YES", label: "Con vehículo" }, { value: "NO", label: "Sin vehículo" }] as const).map((filter) => <button type="button" key={filter.value} onClick={() => { setTradeIn(filter.value); setPage(1); }} className={`filter-pill dashboard-filter-pill ${tradeIn === filter.value ? "filter-pill-active-muted" : ""}`}>{filter.label}</button>)}
        </div>
          </div>
        </details>
      </section>

      {filteredLeads.length ? <Pagination currentPage={currentPage} totalPages={totalPages} visibleCount={visibleLeads.length} totalCount={filteredLeads.length} onPageChange={setPage} /> : null}
      {visibleActiveLeads.length ? <LeadSection title="Conversaciones activas" helper="Responde primero." leads={visibleActiveLeads} expandedLeadIds={expandedLeadIds} onExpandedChange={setLeadExpanded} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleReminderLeads.length ? <LeadSection title="Vencidos o para hoy" helper="Resuelve la alerta." leads={visibleReminderLeads} expandedLeadIds={expandedLeadIds} onExpandedChange={setLeadExpanded} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleNoActionLeads.length ? <LeadSection title="Sin próxima acción" helper="Define el siguiente paso." leads={visibleNoActionLeads} expandedLeadIds={expandedLeadIds} onExpandedChange={setLeadExpanded} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {visibleRemainingLeads.length ? <LeadSection title="Resto de contactos" helper="Seguimientos futuros." leads={visibleRemainingLeads} expandedLeadIds={expandedLeadIds} onExpandedChange={setLeadExpanded} onDeleted={(leadId) => setHiddenLeadIds((current) => [...current, leadId])} /> : null}
      {!visibleLeads.length ? <div className="rounded-[22px] border border-dashed border-black/15 bg-white px-5 py-12 text-center"><Search className="mx-auto text-[var(--muted)]" size={28} /><h3 className="mt-4 font-black">No hay contactos con esos filtros</h3><p className="mt-1 text-sm text-[var(--muted)]">Prueba otra búsqueda o captura un nuevo prospecto.</p></div> : null}
      {filteredLeads.length > pageSize ? <Pagination currentPage={currentPage} totalPages={totalPages} visibleCount={visibleLeads.length} totalCount={filteredLeads.length} onPageChange={setPage} /> : null}
    </div>
  );
}

function LeadSection({ title, helper, leads, expandedLeadIds, onExpandedChange, onDeleted }: { title: string; helper: string; leads: Lead[]; expandedLeadIds: Set<string>; onExpandedChange: (leadId: string, expanded: boolean) => void; onDeleted: (leadId: string) => void }) {
  return <section className="space-y-2.5"><div><div className="flex items-center justify-between"><h2 className="text-lg font-black tracking-[-0.04em]">{title}</h2><span className="text-xs font-bold text-[var(--muted)]">{leads.length}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{helper}</p></div>{leads.map((lead) => <LeadCard key={lead.id} lead={lead} isExpanded={expandedLeadIds.has(lead.id)} onExpandedChange={(expanded) => onExpandedChange(lead.id, expanded)} onDeleted={onDeleted} />)}</section>;
}

function Pagination({ currentPage, totalPages, visibleCount, totalCount, onPageChange }: { currentPage: number; totalPages: number; visibleCount: number; totalCount: number; onPageChange: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/[0.06] bg-white px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(16,24,40,0.035)]"><span className="font-black text-[var(--ink)]">{visibleCount} visibles de {totalCount}</span><div className="flex items-center gap-2"><span className="font-semibold text-[var(--muted)]">Página {currentPage} de {totalPages}</span>{totalPages > 1 ? <div className="flex gap-1"><button type="button" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} className="rounded-lg border border-black/10 px-2.5 py-1.5 font-black disabled:opacity-35">Anterior</button><button type="button" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} className="rounded-lg bg-[var(--ink)] px-2.5 py-1.5 font-black text-white disabled:opacity-35">Siguiente</button></div> : null}</div></div>;
}

/* Dashboard metrics were intentionally removed: this surface is a work queue. */
/*
function MetricCard({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string; helper: string; tone: "dark" | "orange" | "lime" }) {
  const classes = { dark: "bg-[var(--ink)] text-white", orange: "bg-[#fff0e6] text-[var(--ink)]", lime: "bg-[var(--lime)] text-[var(--ink)]" }[tone];
  return <article className={`rounded-[13px] p-2 sm:rounded-[14px] sm:p-3 ${classes}`}><div className="flex items-start justify-between gap-1"><span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/15 sm:size-6 sm:rounded-lg">{icon}</span><span className="text-right text-[8px] font-black uppercase leading-[1.15] tracking-[0.06em] opacity-65 sm:text-[9px]">{label}</span></div><p className="mt-1.5 text-lg font-black tracking-[-0.07em] sm:mt-2 sm:text-2xl">{value}</p><p className="mt-0.5 truncate text-[9px] font-semibold leading-3 opacity-70 sm:text-[10px]">{helper}</p></article>;
}
*/

function LeadCard({ lead, isExpanded, onExpandedChange, onDeleted }: { lead: Lead; isExpanded: boolean; onExpandedChange: (expanded: boolean) => void; onDeleted?: (leadId: string) => void }) {
  const router = useRouter();
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatus>(lead.whatsappStatus);
  const [conversationState, setConversationState] = useState<ConversationState>(lead.conversationState);
  const [followUpActions, setFollowUpActions] = useState<FollowUpAction[]>(lead.followUpActions);
  const [isSending, setIsSending] = useState(false);
  const [isChangingConversation, setIsChangingConversation] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [manualDecision, setManualDecision] = useState<Lead["inboundManualDecision"]>(lead.inboundManualDecision);
  const [isCorrectingInbound, setIsCorrectingInbound] = useState(false);
  const [purchaseDecisionAt, setPurchaseDecisionAt] = useState(lead.purchaseDecisionAt);
  const [isPurchaseConfirming, setIsPurchaseConfirming] = useState(false);
  const [isRecordingPurchase, setIsRecordingPurchase] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
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
  const firstContactMessageAccepted = lead.firstContact?.items.some((item) => item.resourceKind === "MESSAGE" && item.result === "ACCEPTED") ?? false;
  const canSend = !firstContactMessageAccepted && (whatsappStatus === "PENDING" || whatsappStatus === "FAILED");
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
    if (isChangingConversation) return;
    setIsChangingConversation(true);
    setSendError(null);
    setSendInfo(null);
    try {
      const response = await updateLeadConversationAction({ leadId: lead.id, state });
      if (response.success) {
        setConversationState(state);
        setSendInfo(state === "CLOSED" ? "Conversación cerrada. Puedes reabrirla cuando lo necesites." : "Conversación reabierta.");
        router.refresh();
      } else {
        setSendError(response.message || response.error || "No pudimos actualizar la conversación.");
      }
    } catch {
      setSendError("No pudimos actualizar la conversación. Puedes reintentarlo.");
    } finally {
      setIsChangingConversation(false);
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

  const toggleExpanded = () => onExpandedChange(!isExpanded);

  return <article onClick={() => { if (!isExpanded) onExpandedChange(true); }} className={`rounded-[20px] border bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,0.04)] transition hover:shadow-[0_12px_30px_rgba(16,24,40,0.07)] ${!isExpanded ? "cursor-pointer" : ""} sm:p-3.5 ${conversationState === "ACTIVE" ? "border-[#75c88b] ring-1 ring-[#75c88b]/20" : isReminderDue ? "border-[#f3b257] ring-1 ring-[#f3b257]/20" : "border-black/[0.06]"}`}>
    <div onClick={toggleExpanded} className="compact-lead-header flex cursor-pointer flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f0eee8] text-xs font-black">{lead.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h3 className="truncate text-sm font-black">{lead.fullName}</h3><span className="text-xs font-bold text-[var(--muted)]">{lead.phone}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${temperatureClasses(lead.temperature)}`}>{lead.temperature === "HIGH" ? "🔥 " : ""}{getTemperatureLabel(lead.temperature)}</span></div><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{lead.carModel} <span className="mx-1 text-black/20">·</span> {getStatusLabel(lead.status)} <span className="mx-1 text-black/20">·</span> {formatRelativeDate(lead.createdAt)}</p><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]"><span className={`rounded-full px-1.5 py-0.5 font-black ${conversationClasses(conversationState)}`}>{getConversationStateLabel(conversationState)}</span>{isReminderDue ? <span className="rounded-full bg-[#fff8ed] px-1.5 py-0.5 font-black text-[#b94910]">Para hoy</span> : null}<span className="font-bold text-[var(--muted)]">{nextOpenAction ? `${getNextActionLabel(nextOpenAction.actionType)} · ${formatNextActionDate(nextOpenAction.scheduledFor) ?? "sin fecha"}` : "Sin próxima acción"}</span></div></div></div>
      <div className="compact-lead-actions flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
        <span className="shrink-0 rounded-lg bg-[#f6f3ed] px-2 py-1.5 text-center"><strong className="block text-base font-black leading-none">{lead.score}</strong><span className="text-[8px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">score</span></span>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <a aria-label={`Llamar a ${lead.fullName}`} href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="icon-action icon-action-phone" title="Llamar" onClick={(event) => event.stopPropagation()}><Phone size={20} /></a>
          <LeadContactActions compact showWhatsApp={false} showShare={false} contact={{ name: lead.fullName, phone: lead.phone }} />
          <button type="button" aria-label={`Ver información de ${lead.fullName}`} title="Ver información del lead" onClick={(event) => { event.stopPropagation(); setIsDetailsOpen(true); }} className="icon-action"><FileText size={20} /></button>
          <button type="button" aria-label={`Enviar WhatsApp a ${lead.fullName}`} onClick={(event) => { event.stopPropagation(); void sendMessage(); }} disabled={isSending || !canSend} className={`send-whatsapp-button ${!canSend ? "send-whatsapp-button-sent" : ""}`} title={!canSend ? "Mensaje ya enviado; no se duplicará" : whatsappStatus === "FAILED" ? "Reintentar envío automático" : "Enviar WhatsApp automáticamente"}>{isSending ? <LoaderCircle size={20} className="animate-spin" /> : !canSend ? <CheckCircle2 size={20} /> : <Send size={20} />}<span className="hidden sm:inline">{isSending ? "Enviando" : !canSend ? "Enviado" : whatsappStatus === "FAILED" ? "Reintentar" : "Enviar"}</span></button>
          <button type="button" aria-label={purchaseDecisionAt ? "Compra registrada" : "Registrar compra"} title={purchaseDecisionAt ? "Compra registrada" : "Registrar compra"} disabled={Boolean(purchaseDecisionAt)} onClick={(event) => { event.stopPropagation(); if (!purchaseDecisionAt) setIsPurchaseConfirming(true); }} className={`icon-action purchase-action ${purchaseDecisionAt ? "purchase-action-registered" : ""}`}><CircleDollarSign size={20} /></button>
          <a aria-label={`Abrir WhatsApp manual para ${lead.fullName}`} href={`https://wa.me/${formatPhoneForWhatsapp(lead.phone)}`} target="_blank" rel="noreferrer" className="icon-action icon-action-whatsapp" title="Abrir chat de WhatsApp" onClick={(event) => event.stopPropagation()}><WhatsAppLogo size={24} /></a>
          <button type="button" aria-expanded={isExpanded} aria-label={isExpanded ? `Ocultar detalles de ${lead.fullName}` : `Mostrar detalles de ${lead.fullName}`} onClick={(event) => { event.stopPropagation(); toggleExpanded(); }} className="icon-action compact-expand-action" title={isExpanded ? "Ocultar detalles" : "Ver detalles"}>{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
        </div>
      </div>
    </div>

    {isExpanded && lead.lastMessageDirection ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f6f3ed] px-2.5 py-2 text-[11px]"><p className="min-w-0 truncate text-[var(--muted)]"><strong className="text-[var(--ink)]">{lead.lastMessageDirection === "INBOUND" ? "Último mensaje · Cliente:" : "Último mensaje · Tú:"}</strong> {lead.lastMessagePreview || "Mensaje sin texto"}</p>{conversationState === "ACTIVE" ? <button type="button" disabled={isChangingConversation} aria-busy={isChangingConversation} onClick={() => void changeConversationState("CLOSED")} className="shrink-0 font-black text-[var(--muted)] hover:text-[var(--ink)] disabled:cursor-wait disabled:opacity-50">{isChangingConversation ? "Cerrando…" : "Cerrar conversación"}</button> : conversationState === "CLOSED" ? <button type="button" disabled={isChangingConversation} aria-busy={isChangingConversation} onClick={() => void changeConversationState("ACTIVE")} className="shrink-0 font-black text-[#18733a] disabled:cursor-wait disabled:opacity-50">{isChangingConversation ? "Reabriendo…" : "Reabrir"}</button> : null}</div> : null}

    {isExpanded && inboundClassification ? <section hidden aria-hidden="true" className="hidden" aria-label="Estado inbound"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Clasificación inbound</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${inboundClassificationClasses(inboundClassification)}`}>{manualDecision === "REQUIRES_RESPONSE" ? "Respuesta pendiente" : manualDecision === "NO_RESPONSE_REQUIRED" ? "No requiere respuesta" : inboundClassificationLabel(inboundClassification)}</span></div><p className="text-[10px] font-semibold text-[var(--muted)]">{lead.lastInboundMessageAt ? formatRelativeDate(lead.lastInboundMessageAt) : "Sin fecha"}</p></div><p className="mt-2 text-xs leading-5 text-[var(--ink)]">{lead.lastInboundMessagePreview || "Mensaje sin texto"}</p>{inboundClassification !== "NO_SUGGESTION" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={isCorrectingInbound} onClick={() => void correctInbound("REQUIRES_RESPONSE")} className="button-primary min-h-9 px-3 py-2 text-[11px]">{isCorrectingInbound ? "Guardando…" : "Sí requiere respuesta"}</button><button type="button" disabled={isCorrectingInbound} onClick={() => void correctInbound("NO_RESPONSE_REQUIRED")} className="button-secondary min-h-9 px-3 py-2 text-[11px]">No requiere respuesta</button></div> : null}</section> : null}

    {isExpanded && purchaseDecisionAt ? <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 size={14} />Compra registrada · {new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil" }).format(new Date(purchaseDecisionAt))}</p> : null}

    {isExpanded ? <FollowUpActions leadId={lead.id} actions={followUpActions} onActionsChange={setFollowUpActions} onConversationWaiting={() => setConversationState("WAITING_CUSTOMER")} onError={setSendError} onInfo={setSendInfo} /> : null}
    {isExpanded ? <FirstContactSummary lead={lead} initialOperation={lead.firstContact} /> : null}
    {isExpanded && lead.lastCustomerMessageAt ? <p className="mt-3 text-[11px] text-[var(--muted)]">Última respuesta del cliente registrada. Las acciones pendientes se cancelan cuando llega una nueva respuesta.</p> : null}
    {isExpanded && <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3"><span className="text-[11px] text-[var(--muted)]">Se ocultará de la lista y dejará de generar recordatorios.</span><button type="button" onClick={(event) => { event.stopPropagation(); setIsDeleteModalOpen(true); setSendError(null); }} disabled={isDeleting} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-[#b33a2c] hover:bg-[#fff0ee] disabled:opacity-50"><Trash2 size={14} />Eliminar contacto</button></div>}
    {isExpanded && sendError ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-red-600"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{sendError}</p> : null}{isExpanded && sendInfo ? <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />{sendInfo}</p> : null}
    {isDetailsOpen ? <div role="presentation" onClick={(event) => { event.stopPropagation(); setIsDetailsOpen(false); }} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby={`details-title-${lead.id}`} onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_24px_80px_rgba(16,24,40,0.24)]"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Información del lead</p><h2 id={`details-title-${lead.id}`} className="mt-1 text-lg font-black">{lead.fullName}</h2><p className="text-xs font-bold text-[var(--muted)]">{lead.phone}</p></div><button type="button" aria-label="Cerrar información del lead" title="Cerrar" onClick={() => setIsDetailsOpen(false)} className="icon-action"><X size={18} /></button></div><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-[#f6f3ed] p-2.5"><dt className="font-black text-[var(--muted)]">Interés</dt><dd className="mt-1 font-bold text-[var(--ink)]">{lead.carModels.length ? lead.carModels.join(", ") : lead.carModel}</dd></div><div className="rounded-xl bg-[#f6f3ed] p-2.5"><dt className="font-black text-[var(--muted)]">Momento de compra</dt><dd className="mt-1 font-bold text-[var(--ink)]">{getTimeframeLabel(lead.timeframe)}</dd></div><div className="rounded-xl bg-[#f6f3ed] p-2.5"><dt className="font-black text-[var(--muted)]">Forma de pago</dt><dd className="mt-1 font-bold text-[var(--ink)]">{getPaymentMethodLabel(lead.paymentMethod)}</dd></div><div className="rounded-xl bg-[#f6f3ed] p-2.5"><dt className="font-black text-[var(--muted)]">Parte de pago</dt><dd className="mt-1 font-bold text-[var(--ink)]">{lead.tradeInCar ? "Sí" : "No"}</dd></div><div className="rounded-xl bg-[#f6f3ed] p-2.5"><dt className="font-black text-[var(--muted)]">Estado</dt><dd className="mt-1 font-bold text-[var(--ink)]">{getStatusLabel(lead.status)}</dd></div><div className="rounded-xl bg-[#f6f3ed] p-2.5"><dt className="font-black text-[var(--muted)]">Prioridad</dt><dd className="mt-1 font-bold text-[var(--ink)]">{getTemperatureLabel(lead.temperature)}</dd></div></dl><div className="mt-3 rounded-xl border border-black/[0.06] bg-white p-3"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Nota rápida</p><p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[var(--ink)]">{lead.notes?.trim() || "Sin nota"}</p></div></div></div> : null}
    {isPurchaseConfirming ? <div role="presentation" onClick={(event) => { event.stopPropagation(); if (!isRecordingPurchase) setIsPurchaseConfirming(false); }} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby={`purchase-title-${lead.id}`} onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[22px] border border-black/[0.08] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.24)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff8df] text-[#8a5b00]"><CircleDollarSign size={20} /></span><div><h2 id={`purchase-title-${lead.id}`} className="text-lg font-black">Registrar compra</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">¿Confirmas que {lead.fullName} decidió comprar?</p></div></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsPurchaseConfirming(false)} disabled={isRecordingPurchase} className="button-secondary min-h-9 px-3 py-2 text-[11px]">Cancelar</button><button type="button" disabled={isRecordingPurchase} onClick={() => void recordPurchaseDecision()} className="button-primary min-h-9 px-3 py-2 text-[11px]">{isRecordingPurchase ? "Registrando…" : "Confirmar"}</button></div></div></div> : null}
    {isDeleteModalOpen ? <div role="presentation" onClick={(event) => { event.stopPropagation(); if (!isDeleting) setIsDeleteModalOpen(false); }} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby={`delete-title-${lead.id}`} onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[26px] border border-black/[0.08] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.24)] sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0ee] text-[#b33a2c]"><Trash2 size={18} /></span><div><h2 id={`delete-title-${lead.id}`} className="text-lg font-black">¿Eliminar a {lead.fullName}?</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">El contacto se ocultará del resumen, dejará de generar recordatorios y no se eliminarán físicamente sus datos. Podrás conservarlo para auditoría.</p></div></div>{sendError ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{sendError}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting} className="button-secondary">Cancelar</button><button type="button" onClick={() => void deleteContact()} disabled={isDeleting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#b33a2c] px-4 text-sm font-black text-white disabled:opacity-60"><Trash2 size={16} />{isDeleting ? "Eliminando" : "Eliminar contacto"}</button></div></div></div> : null}
  </article>;
}
