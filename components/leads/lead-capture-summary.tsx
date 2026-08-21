import { BadgeCheck, CarFront, CreditCard, FileText, Target } from "lucide-react";

import type { Lead } from "@/lib/domain/lead";
import { leadTimeframes, paymentMethods } from "@/lib/domain/lead";

function getTimeframeLabel(value: Lead["timeframe"]): string {
  return leadTimeframes.find((option) => option.value === value)?.label ?? value;
}

function getPaymentMethodLabel(value: Lead["paymentMethod"]): string {
  return paymentMethods.find((option) => option.value === value)?.label ?? value;
}

function SummaryCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="min-w-0 rounded-lg bg-[#f6f3ed] px-2 py-1.5"><p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.06em] text-[var(--muted)]">{icon}{label}</p><p className="mt-0.5 truncate text-[11px] font-black text-[var(--ink)]">{value}</p></div>;
}

export function LeadCaptureSummary({ lead }: { lead: Pick<Lead, "fullName" | "phone" | "carModels" | "timeframe" | "paymentMethod" | "tradeInCar" | "notes" | "score"> }) {
  return <section className="rounded-xl border border-[#dce5ef] bg-[#f8fbff] p-2.5" aria-label="Resumen del lead guardado">
    <div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--lime)] text-[var(--ink)]"><BadgeCheck size={17} /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Datos guardados</p><p className="truncate text-sm font-black">{lead.fullName} <span className="font-semibold text-[var(--muted)]">· {lead.phone}</span></p></div><span className="shrink-0 rounded-lg bg-white px-2 py-1 text-center"><strong className="block text-sm font-black leading-none">{lead.score}</strong><span className="text-[8px] font-black uppercase tracking-[0.06em] text-[var(--muted)]">score</span></span></div>
    <div className="mt-2 grid grid-cols-2 gap-1.5"><SummaryCell label="Interés" value={lead.carModels.join(", ")} icon={<CarFront size={11} />} /><SummaryCell label="Compra" value={getTimeframeLabel(lead.timeframe)} icon={<Target size={11} />} /><SummaryCell label="Pago" value={getPaymentMethodLabel(lead.paymentMethod)} icon={<CreditCard size={11} />} /><SummaryCell label="Parte de pago" value={lead.tradeInCar ? "Sí, tiene vehículo" : "No"} icon={<CarFront size={11} />} /></div>
    <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-white px-2 py-1.5"><FileText size={12} className="mt-0.5 shrink-0 text-[var(--muted)]" /><p className="min-w-0 text-[11px] leading-4"><span className="font-black">Nota: </span>{lead.notes?.trim() || <span className="text-[var(--muted)]">Sin nota</span>}</p></div>
  </section>;
}
