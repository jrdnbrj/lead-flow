"use client";

import { CheckCircle2, DollarSign, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useEffect } from "react";

import { cardModalities, calculateCardQuote, formatCardCurrency, formatCardFactorPercentage, formatCardAmountInput, getCardTerms, parseCardAmount, validateCardQuote, type CardModality } from "@/lib/financial/card-quote";
import type { CardQuoteDraft } from "@/lib/financial/card-quote";

type CardQuoteCalculatorProps = {
  description?: ReactNode;
  embedded?: boolean;
  onClose?: () => void;
  onDraftChange?: (draft: CardQuoteDraft) => void;
};

export function CardQuoteCalculator({ description = "Calcula una cuota sin guardar cambios.", embedded = false, onClose, onDraftChange }: CardQuoteCalculatorProps) {
  const [modality, setModality] = useState<CardModality>("NORMAL");
  const [term, setTerm] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
  const amount = amountText.trim() ? parseCardAmount(amountText) ?? Number.NaN : null;
  const validation = validateCardQuote({ modality, term, amount });
  const quote = calculateCardQuote({ modality, term, amount });
  const terms = getCardTerms(modality);
  const waitingForInput = amountText.trim() === "" && term === null;

  useEffect(() => {
    onDraftChange?.({ modality, term, amount });
  }, [amount, modality, onDraftChange, term]);

  function changeModality(nextModality: CardModality) {
    setModality(nextModality);
    const nextTerm = term !== null && getCardTerms(nextModality).includes(term) ? term : null;
    if (nextTerm !== term) setTerm(nextTerm);
  }

  function changeAmount(nextAmountText: string) {
    const formattedAmount = formatCardAmountInput(nextAmountText);
    setAmountText(formattedAmount);
  }

  return (
    <div className={embedded ? "" : "rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.08)] sm:p-5"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Cotización</p>
          <h2 className="mt-1 text-lg font-black">Tarjeta de crédito</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{description}</p>
        </div>
        {onClose ? <button type="button" aria-label="Cerrar cotizador" title="Cerrar" onClick={onClose} className="icon-action shrink-0"><X size={18} /></button> : null}
      </div>

      <div className="mt-4 space-y-3">
        <fieldset>
          <legend className="text-xs font-black text-[var(--ink)]">Modalidad</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {cardModalities.map((option) => <button key={option.value} type="button" aria-pressed={modality === option.value} onClick={() => changeModality(option.value)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-black transition ${modality === option.value ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-[#f6f3ed] text-[var(--ink)] hover:border-black/25"}`}>{option.label}</button>)}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-black text-[var(--ink)]">Plazo</legend>
          <div className="mt-1.5 grid grid-cols-5 gap-1.5">
            {terms.map((option) => <button key={option} type="button" aria-pressed={term === option} onClick={() => setTerm(option)} className={`min-h-9 rounded-lg border px-1 text-[11px] font-black transition ${term === option ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-white text-[var(--ink)] hover:border-black/25"}`}>{option} <span className="font-semibold">meses</span></button>)}
          </div>
          <p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">Sólo se muestran los plazos válidos para esta modalidad.</p>
        </fieldset>

        <label className="block text-xs font-black text-[var(--ink)]">Monto a financiar<span className="relative mt-1.5 block"><span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg bg-[#f6f3ed] text-[#8a5b00]"><DollarSign size={15} strokeWidth={2.5} /></span><input value={amountText} onChange={(event) => changeAmount(event.target.value)} inputMode="decimal" placeholder="Ej. 3.000" className="field-input pl-12" style={{ paddingLeft: "3.5rem" }} /></span></label>
      </div>

      <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#f8fbff] p-3">
        <p className="eyebrow">Resultado</p>
        {waitingForInput ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Selecciona un plazo e ingresa el monto para ver la cuota.</p> : validation && !validation.valid ? <p className="mt-2 text-xs font-semibold text-[#b33a2c]" role="alert">{validation.message}</p> : quote ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><QuoteResult label="Factor" value={formatCardFactorPercentage(quote.factor)} /><QuoteResult label="Interés" value={formatCardCurrency(quote.interest)} /><QuoteResult label="Total" value={formatCardCurrency(quote.total)} /><QuoteResult label="Cuota mensual" value={formatCardCurrency(quote.installment)} highlight /></div> : null}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-[var(--muted)]"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-700" /><p>Simulación de financiamiento referencial; no representa aprobación crediticia.</p></div>
    </div>
  );
}

function QuoteResult({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg p-2.5 ${highlight ? "bg-[var(--lime)]" : "bg-white"}`}><p className="text-[10px] font-black text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-black text-[var(--ink)]">{value}</p></div>;
}
