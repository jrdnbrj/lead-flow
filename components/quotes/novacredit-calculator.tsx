"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";

import { formatCardAmountInput, formatCardCurrency, parseCardAmount } from "@/lib/financial/card-quote";
import { calculateNovaCreditQuote, getNovaCreditTerms, novaCreditRules, validateNovaCreditQuote, type NovaCreditDraft } from "@/lib/financial/novacredit";

const percentageFormatter = new Intl.NumberFormat("es-EC", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function NovaCreditCalculator() {
  const [vehicleValueText, setVehicleValueText] = useState("");
  const [accessoriesText, setAccessoriesText] = useState("");
  const [downPaymentText, setDownPaymentText] = useState("");
  const [deviceText, setDeviceText] = useState(formatCardAmountInput(String(novaCreditRules.defaultDevice)));
  const [term, setTerm] = useState<number | null>(null);

  const draft = useMemo<NovaCreditDraft>(() => ({
    vehicleValue: parseMoney(vehicleValueText),
    accessories: parseMoney(accessoriesText),
    downPayment: parseMoney(downPaymentText),
    term,
    device: parseMoney(deviceText),
  }), [accessoriesText, deviceText, downPaymentText, term, vehicleValueText]);
  const validation = validateNovaCreditQuote(draft);
  const quote = calculateNovaCreditQuote(draft);

  return (
    <section className="rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.08)] sm:p-5" aria-labelledby="novacredit-title">
      <div>
        <p className="eyebrow">Cotización</p>
        <h2 id="novacredit-title" className="mt-1 text-lg font-black">Crédito vehicular</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Calcula una cuota referencial con los datos del vehículo. El valor lo ingresa el asesor.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MoneyField id="novacredit-vehicle-value" label="Valor del vehículo" value={vehicleValueText} onChange={setVehicleValueText} placeholder="Ej. 23.000" />
        <MoneyField id="novacredit-accessories" label="Accesorios u otros" value={accessoriesText} onChange={setAccessoriesText} placeholder="Opcional" />
        <MoneyField id="novacredit-down-payment" label="Entrada" value={downPaymentText} onChange={setDownPaymentText} placeholder="Ej. 5.750" />
        <MoneyField id="novacredit-device" label="Dispositivo" value={deviceText} onChange={setDeviceText} placeholder={formatCardAmountInput(String(novaCreditRules.defaultDevice))} />
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-black text-[var(--ink)]">Plazo</legend>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {getNovaCreditTerms().map((option) => <button key={option} type="button" aria-pressed={term === option} onClick={() => setTerm(option)} className={`min-h-9 rounded-lg border px-1 text-[11px] font-black transition ${term === option ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-white text-[var(--ink)] hover:border-black/25"}`}>{option} <span className="font-semibold">meses</span></button>)}
        </div>
        <p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">Sólo se muestran los plazos aprobados para esta versión.</p>
      </fieldset>

      <div className="mt-4 rounded-xl border border-black/[0.06] bg-[#f8fbff] p-3">
        <p className="eyebrow">Resultado</p>
        {isEmptyDraft(draft) ? <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Ingresa el valor, la entrada y el plazo para ver la cuota.</p> : !validation.valid ? <p className="mt-2 text-xs font-semibold text-[#b33a2c]" role="alert">{validation.message}</p> : quote ? <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <QuoteResult label="Valor del vehículo" value={formatCardCurrency(quote.totalVehicleValue)} />
          <QuoteResult label="Entrada mínima" value={formatCardCurrency(quote.minimumDownPayment)} />
          <QuoteResult label="Entrada" value={`${formatCardCurrency(quote.downPayment)} · ${percentageFormatter.format(quote.downPaymentPercentage)}`} />
          <QuoteResult label="Plazo" value={`${quote.term} meses`} />
          <QuoteResult label="Valor financiado" value={formatCardCurrency(quote.financedValue)} />
          <QuoteResult label="Gastos legales" value={formatCardCurrency(quote.legalExpenses)} />
          <QuoteResult label="Seguro vehicular" value={formatCardCurrency(quote.vehicleInsurance)} />
          <QuoteResult label="Cuota mensual" value={formatCardCurrency(quote.monthlyInstallment)} highlight />
          <QuoteResult label="Cuota final referencial" value={formatCardCurrency(quote.finalInstallment)} highlight />
        </div> : null}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-[var(--muted)]"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-700" /><p>Simulación de financiamiento referencial; no representa aprobación crediticia.</p></div>
    </section>
  );
}

function MoneyField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label htmlFor={id} className="block text-xs font-black text-[var(--ink)]">{label}<span className="relative mt-1.5 block"><span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg bg-[#f6f3ed] text-[#8a5b00]">$</span><input id={id} value={value} onChange={(event) => onChange(formatCardAmountInput(event.target.value))} inputMode="decimal" placeholder={placeholder} className="field-input pl-12" style={{ paddingLeft: "3.5rem" }} /></span></label>;
}

function QuoteResult({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={`rounded-lg p-2.5 ${highlight ? "bg-[var(--lime)]" : "bg-white"}`}><p className="text-[10px] font-black text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-black text-[var(--ink)]">{value}</p></div>;
}

function parseMoney(value: string): number | null {
  return value.trim() ? parseCardAmount(value) ?? Number.NaN : null;
}

function isEmptyDraft(draft: NovaCreditDraft): boolean {
  return draft.vehicleValue === null && draft.accessories === null && draft.downPayment === null && draft.term === null;
}
