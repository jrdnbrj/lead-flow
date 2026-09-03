"use client";

import { Calculator, CheckCircle2, X } from "lucide-react";
import { useState } from "react";

import type { Lead } from "@/lib/domain/lead";
import { cardModalities, calculateCardQuote, formatCardCurrency, formatCardFactor, getCardTerms, parseCardAmount, validateCardQuote, type CardModality } from "@/lib/financial/card-quote";

type CardQuoteLead = Pick<Lead, "id" | "fullName" | "carModels">;

export function CardQuoteTool({ lead }: { lead: CardQuoteLead }) {
  const [isOpen, setIsOpen] = useState(false);
  const [modality, setModality] = useState<CardModality>("NORMAL");
  const [term, setTerm] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
  const [selectedModel, setSelectedModel] = useState(lead.carModels.length === 1 ? lead.carModels[0] : "");
  const titleId = `card-quote-title-${lead.id}`;
  const amount = amountText.trim() ? parseCardAmount(amountText) ?? Number.NaN : null;
  const modelRequired = lead.carModels.length > 1;
  const hasModel = !modelRequired || Boolean(selectedModel);
  const validation = hasModel ? validateCardQuote({ modality, term, amount }) : null;
  const quote = hasModel ? calculateCardQuote({ modality, term, amount }) : null;
  const terms = getCardTerms(modality);
  const waitingForInput = amountText.trim() === "" && term === null;

  function changeModality(nextModality: CardModality) {
    setModality(nextModality);
    if (term !== null && !getCardTerms(nextModality).includes(term)) setTerm(null);
  }

  function close() {
    setIsOpen(false);
  }

  return <>
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#fbfaf7] px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#fff8df] text-[#8a5b00]"><Calculator size={15} /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Cotizador de tarjeta</p><p className="truncate text-[11px] font-semibold text-[var(--muted)]">Calcula una cuota informativa sin guardar cambios.</p></div></div>
      <button type="button" onClick={() => setIsOpen(true)} className="button-secondary min-h-9 shrink-0 px-3 py-1.5 text-[11px]"><Calculator size={14} />Cotizar</button>
    </div>

    {isOpen ? <div role="presentation" onClick={close} className="fixed inset-0 z-[75] grid place-items-center bg-[#101828]/55 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_24px_80px_rgba(16,24,40,0.24)] sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Cotización informativa</p><h2 id={titleId} className="mt-1 text-lg font-black">Tarjeta de crédito</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{lead.fullName} · sin modificar el lead ni enviar mensajes.</p></div><button type="button" aria-label="Cerrar cotizador" title="Cerrar" onClick={close} className="icon-action shrink-0"><X size={18} /></button></div>

        <div className="mt-4 space-y-3">
          {modelRequired ? <label className="block text-xs font-black text-[var(--ink)]">Vehículo a cotizar<select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} className="field-input mt-1.5"><option value="">Selecciona un vehículo</option>{lead.carModels.map((model) => <option key={model} value={model}>{model}</option>)}</select></label> : <div className="rounded-xl bg-[#f6f3ed] px-3 py-2.5 text-xs"><p className="font-black text-[var(--muted)]">Vehículo</p><p className="mt-1 font-bold">{lead.carModels[0] ?? "Sin modelo"}</p></div>}

          <fieldset><legend className="text-xs font-black text-[var(--ink)]">Modalidad</legend><div className="mt-1.5 grid grid-cols-2 gap-1.5">{cardModalities.map((option) => <button key={option.value} type="button" aria-pressed={modality === option.value} onClick={() => changeModality(option.value)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-black transition ${modality === option.value ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-[#f6f3ed] text-[var(--ink)] hover:border-black/25"}`}>{option.label}</button>)}</div></fieldset>

          <fieldset><legend className="text-xs font-black text-[var(--ink)]">Plazo</legend><div className="mt-1.5 grid grid-cols-5 gap-1.5">{terms.map((option) => <button key={option} type="button" aria-pressed={term === option} onClick={() => setTerm(option)} className={`min-h-9 rounded-lg border px-1 text-[11px] font-black transition ${term === option ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-white text-[var(--ink)] hover:border-black/25"}`}>{option} <span className="font-semibold">meses</span></button>)}</div><p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">Sólo se muestran los plazos válidos para esta modalidad.</p></fieldset>

          <label className="block text-xs font-black text-[var(--ink)]">Monto a financiar<input value={amountText} onChange={(event) => setAmountText(event.target.value)} inputMode="decimal" placeholder="Ej. 3000" className="field-input mt-1.5" /></label>
        </div>

        <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#f8fbff] p-3">
          <p className="eyebrow">Resultado</p>
          {!hasModel ? <p className="mt-2 text-xs font-semibold text-[#b33a2c]" role="alert">Selecciona el vehículo que quieres cotizar.</p> : waitingForInput ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Selecciona un plazo e ingresa el monto para ver la cuota.</p> : validation && !validation.valid ? <p className="mt-2 text-xs font-semibold text-[#b33a2c]" role="alert">{validation.message}</p> : quote ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><QuoteResult label="Factor" value={formatCardFactor(quote.factor)} /><QuoteResult label="Interés" value={formatCardCurrency(quote.interest)} /><QuoteResult label="Total" value={formatCardCurrency(quote.total)} /><QuoteResult label="Cuota mensual" value={formatCardCurrency(quote.installment)} highlight /></div> : null}
        </div>

        <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-[var(--muted)]"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-700" /><p>Esta cotización es informativa y no representa aprobación crediticia.</p></div>
      </div>
    </div> : null}
  </>;
}

function QuoteResult({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg p-2.5 ${highlight ? "bg-[var(--lime)]" : "bg-white"}`}><p className="text-[10px] font-black text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-black text-[var(--ink)]">{value}</p></div>;
}
