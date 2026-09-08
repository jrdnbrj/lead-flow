import type { Metadata } from "next";

import { QuoteWorkspace } from "@/components/quotes/quote-workspace";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { getQuoteLeadOptions } from "@/lib/quotes/repository";

export const metadata: Metadata = { title: "Cotización" };
export const dynamic = "force-dynamic";

export default async function CotizacionPage({ searchParams }: { searchParams?: Promise<{ leadId?: string | string[] }> }) {
  const advisorUserId = await requireAdvisorOrRedirect("/cotizacion");
  const [{ leadOptions, catalogModels }, sellerProfile] = await Promise.all([
    getQuoteLeadOptions(advisorUserId),
    getEffectiveSellerProfile(),
  ]);
  const params = await searchParams;
  const initialLeadId = Array.isArray(params?.leadId) ? params.leadId[0] : params?.leadId;

  return <div className="mx-auto max-w-3xl">
    <div className="mb-7 sm:mb-10">
      <p className="eyebrow">Cotización</p>
      <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Calcula sin abrir un lead.</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Elige el tipo de cotización, ingresa los datos y obtén una cuota referencial. No necesitas un lead para calcular.</p>
    </div>
    <QuoteWorkspace leadOptions={leadOptions} catalogModels={catalogModels} sellerProfile={sellerProfile} initialLeadId={initialLeadId ?? null} />
  </div>;
}
