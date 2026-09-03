import type { Metadata } from "next";

import { CardQuoteCalculator } from "@/components/quotes/card-quote-calculator";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";

export const metadata: Metadata = { title: "Cotización" };
export const dynamic = "force-dynamic";

export default async function CotizacionPage() {
  await requireAdvisorOrRedirect("/cotizacion");

  return <div className="mx-auto max-w-3xl">
    <div className="mb-7 sm:mb-10">
      <p className="eyebrow">Cotización</p>
      <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Calcula sin abrir un lead.</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Ingresa el monto, elige la modalidad y selecciona un plazo. El cálculo es informativo y no guarda cambios.</p>
    </div>
    <CardQuoteCalculator description="Calcula una cuota de Tarjeta de crédito sin lead, cliente ni vehículo." />
  </div>;
}
