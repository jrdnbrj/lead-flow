"use client";

import * as XLSX from "xlsx";
import { Download, Flame, MessageCircle, Phone, Search, SlidersHorizontal, Target, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Lead, LeadStatus, LeadTemperature } from "@/lib/domain/lead";
import { formatPhoneForWhatsapp, getStatusLabel, getTemperatureLabel } from "@/lib/domain/lead";

type TemperatureFilter = "ALL" | LeadTemperature;
type StatusFilter = "ALL" | LeadStatus;

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Todos los estados" },
  { value: "NUEVO", label: "Nuevos" },
  { value: "CONTACTADO", label: "Contactados" },
  { value: "COTIZADO", label: "Cotizados" },
];

function isLead(value: unknown): value is Lead {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.fullName === "string" && typeof record.phone === "string" && typeof record.score === "number" && typeof record.temperature === "string";
}

function formatRelativeDate(date: string): string {
  const day = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(date));
  return day.replace(".", "");
}

function temperatureClasses(temperature: LeadTemperature): string {
  return { HIGH: "bg-[#fff0e6] text-[#b94910]", MEDIUM: "bg-[#fff8d8] text-[#8c6c00]", LOW: "bg-[#edf0f4] text-[#647084]" }[temperature];
}

export function DashboardClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [localLeads, setLocalLeads] = useState<Lead[]>([]);
  const [temperature, setTemperature] = useState<TemperatureFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("leadflow:leads");
    if (!stored) return;
    let timer: number | undefined;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const validLeads = parsed.filter(isLead);
        timer = window.setTimeout(() => setLocalLeads(validLeads), 0);
      }
    } catch {
      window.localStorage.removeItem("leadflow:leads");
    }
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, []);

  const leads = useMemo(() => {
    const merged = [...localLeads, ...initialLeads];
    return merged.filter((lead, index, all) => all.findIndex((candidate) => candidate.id === lead.id) === index);
  }, [initialLeads, localLeads]);

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const matchesTemperature = temperature === "ALL" || lead.temperature === temperature;
    const matchesStatus = status === "ALL" || lead.status === status;
    const normalizedQuery = query.toLowerCase().trim();
    const matchesQuery = !normalizedQuery || `${lead.fullName} ${lead.phone} ${lead.carModel}`.toLowerCase().includes(normalizedQuery);
    return matchesTemperature && matchesStatus && matchesQuery;
  }), [leads, query, status, temperature]);

  const highCount = leads.filter((lead) => lead.temperature === "HIGH").length;
  const pendingCount = leads.filter((lead) => lead.status === "NUEVO" || lead.status === "CONTACTADO").length;
  const highPercent = leads.length ? Math.round((highCount / leads.length) * 100) : 0;

  function exportToXlsx() {
    const rows = filteredLeads.map((lead) => ({
      Nombre: lead.fullName,
      Celular: lead.phone,
      Modelo: lead.carModel,
      "Momento de compra": lead.timeframe,
      "Forma de pago": lead.paymentMethod,
      Retoma: lead.tradeInCar ? "Sí" : "No",
      Puntaje: lead.score,
      Prioridad: getTemperatureLabel(lead.temperature),
      Estado: getStatusLabel(lead.status),
      "Fecha de captura": lead.createdAt,
      Notas: lead.notes || "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    XLSX.writeFile(workbook, `leadflow-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-7">
      <section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Panel de ventas · 27 julio 2026</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-black leading-[0.96] tracking-[-0.065em] sm:text-6xl">Tu próximo cierre empieza con el siguiente lead.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Captura rápido, prioriza mejor y llega al seguimiento con el contexto que necesitas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/nuevo" className="button-primary"><Target size={17} />Capturar lead</a>
          <button type="button" onClick={exportToXlsx} className="button-secondary"><Download size={17} />Exportar XLSX</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={<UserRound size={18} />} label="Total leads" value={String(leads.length)} helper="capturados" tone="dark" />
        <MetricCard icon={<Flame size={18} />} label="Alta prioridad" value={`${highPercent}%`} helper={`${highCount} leads listos para acción`} tone="orange" />
        <MetricCard icon={<MessageCircle size={18} />} label="Pendientes" value={String(pendingCount)} helper="con siguiente paso" tone="lime" />
      </section>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-[0_16px_50px_rgba(16,24,40,0.05)] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-black"><SlidersHorizontal size={17} />Filtra tu pipeline</div>
          <label className="flex h-11 w-full items-center gap-2 rounded-xl bg-[#f6f3ed] px-3 text-[var(--muted)] lg:max-w-xs"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, celular o modelo" className="w-full bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[#9a9b9b]" /></label>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((value) => {
            const label = value === "ALL" ? "Todas las prioridades" : value === "HIGH" ? "🔥 Alta" : value === "MEDIUM" ? "Media" : "Baja";
            return <button type="button" key={value} onClick={() => setTemperature(value)} className={`filter-pill ${temperature === value ? "filter-pill-active" : ""}`}>{label}</button>;
          })}
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => <button type="button" key={filter.value} onClick={() => setStatus(filter.value)} className={`filter-pill ${status === filter.value ? "filter-pill-active-muted" : ""}`}>{filter.label}</button>)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-xl font-black tracking-[-0.04em]">Seguimiento de hoy</h2><span className="text-sm font-bold text-[var(--muted)]">{filteredLeads.length} visibles</span></div>
        {filteredLeads.length ? filteredLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />) : <div className="rounded-[28px] border border-dashed border-black/15 bg-white px-5 py-14 text-center"><Search className="mx-auto text-[var(--muted)]" size={28} /><h3 className="mt-4 font-black">No hay leads con esos filtros</h3><p className="mt-1 text-sm text-[var(--muted)]">Prueba otra búsqueda o captura un nuevo prospecto.</p></div>}
      </section>
    </div>
  );
}

function MetricCard({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string; helper: string; tone: "dark" | "orange" | "lime" }) {
  const classes = { dark: "bg-[var(--ink)] text-white", orange: "bg-[#fff0e6] text-[var(--ink)]", lime: "bg-[var(--lime)] text-[var(--ink)]" }[tone];
  return <article className={`rounded-[24px] p-5 ${classes}`}><div className="flex items-center justify-between"><span className="grid size-9 place-items-center rounded-xl bg-white/15">{icon}</span><span className="text-[11px] font-black uppercase tracking-[0.12em] opacity-65">{label}</span></div><p className="mt-6 text-4xl font-black tracking-[-0.07em]">{value}</p><p className="mt-1 text-xs font-semibold opacity-70">{helper}</p></article>;
}

function LeadCard({ lead }: { lead: Lead }) {
  const message = encodeURIComponent(`Hola ${lead.fullName.split(" ")[0]}, soy tu asesor. Gracias por visitarnos; te escribo para seguir con la información de tu ${lead.carModel}.`);
  return <article className="rounded-[26px] border border-black/[0.06] bg-white p-4 shadow-[0_12px_36px_rgba(16,24,40,0.045)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(16,24,40,0.08)] sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f0eee8] text-sm font-black">{lead.fullName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-black">{lead.fullName}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${temperatureClasses(lead.temperature)}`}>{lead.temperature === "HIGH" ? "🔥 " : ""}{getTemperatureLabel(lead.temperature)}</span></div><p className="mt-1 text-sm text-[var(--muted)]">{lead.carModel} <span className="mx-1 text-black/20">·</span> {getStatusLabel(lead.status)} <span className="mx-1 text-black/20">·</span> {formatRelativeDate(lead.createdAt)}</p><p className="mt-2 line-clamp-1 text-xs font-medium text-[#777c86]">{lead.notes || "Sin notas adicionales"}</p></div></div><div className="flex items-center gap-2 sm:shrink-0"><span className="mr-auto rounded-xl bg-[#f6f3ed] px-3 py-2 text-center sm:mr-2"><strong className="block text-lg font-black leading-none">{lead.score}</strong><span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">score</span></span><a aria-label={`Llamar a ${lead.fullName}`} href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="icon-action" title="Llamar"><Phone size={17} /></a><a aria-label={`Escribir por WhatsApp a ${lead.fullName}`} href={`https://wa.me/${formatPhoneForWhatsapp(lead.phone)}?text=${message}`} target="_blank" rel="noreferrer" className="icon-action icon-action-whatsapp" title="WhatsApp"><MessageCircle size={17} /></a></div></div></article>;
}
