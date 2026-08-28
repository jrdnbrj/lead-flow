import type { Metadata } from "next";

import { CarCatalog } from "@/components/catalog/car-catalog";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getCatalogModels } from "@/lib/catalog/repository";

export const metadata: Metadata = { title: "Catálogo de autos" };
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  await requireAdvisorOrRedirect("/catalogo");
  const models = await getCatalogModels();
  return <div className="mx-auto max-w-6xl"><div className="mb-7 sm:mb-10"><p className="eyebrow">Consulta rápida para el asesor</p><h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Catálogo de autos.</h1><p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Encuentra la foto, la ficha técnica y los colores disponibles de cada modelo.</p></div><CarCatalog models={models} /></div>;
}
