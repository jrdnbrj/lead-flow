import type { Metadata } from "next";

import { QrCard } from "@/components/qr/qr-card";
import { isAuthRequiredEnabled } from "@/lib/auth/auth-required";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getEffectiveSellerProfile } from "@/lib/config/seller";

export const metadata: Metadata = { title: "Comparte tu contacto" };
export const dynamic = "force-dynamic";

type QrPageProps = {
  searchParams: Promise<{ leadId?: string; name?: string }>;
};

export default async function QrPage({ searchParams }: QrPageProps) {
  const params = await searchParams;
  if (isAuthRequiredEnabled()) await requireAdvisorOrRedirect(`/qr${params.leadId ? `?leadId=${encodeURIComponent(params.leadId)}` : ""}`);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 sm:mb-10">
        <p className="eyebrow">Paso final · conexión directa</p>
        <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Convierte una visita en una conversación.</h1>
      </div>
      <QrCard seller={await getEffectiveSellerProfile()} leadName={params.name} />
      <div className="mt-4 flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-xs text-[var(--muted)]"><span>{params.leadId ? "Contacto capturado. Ya puedes compartir tus datos." : "Código listo para compartir tus datos."}</span><span className="font-bold">{params.leadId ? "Listo" : "Activo"}</span></div>
    </div>
  );
}
