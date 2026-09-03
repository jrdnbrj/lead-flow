"use client";

import { Calculator } from "lucide-react";
import { useState } from "react";

import { CardQuoteCalculator } from "@/components/quotes/card-quote-calculator";
import type { Lead } from "@/lib/domain/lead";

type CardQuoteLead = Pick<Lead, "fullName">;

export function CardQuoteTool({ lead }: { lead: CardQuoteLead }) {
  const [isOpen, setIsOpen] = useState(false);

  return <>
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#fbfaf7] px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#fff8df] text-[#8a5b00]"><Calculator size={15} /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Cotizador de tarjeta</p><p className="truncate text-[11px] font-semibold text-[var(--muted)]">Calcula una cuota informativa sin guardar cambios.</p></div></div>
      <button type="button" onClick={() => setIsOpen(true)} className="button-secondary min-h-9 shrink-0 px-3 py-1.5 text-[11px]"><Calculator size={14} />Cotizar</button>
    </div>

    {isOpen ? <div role="presentation" onClick={() => setIsOpen(false)} className="fixed inset-0 z-[75] grid place-items-center bg-[#101828]/55 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Cotización de tarjeta de crédito" onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_24px_80px_rgba(16,24,40,0.24)] sm:p-5">
        <CardQuoteCalculator description={<>{lead.fullName} · sin modificar el lead ni enviar mensajes.</>} embedded onClose={() => setIsOpen(false)} />
      </div>
    </div> : null}
  </>;
}
