import type { Metadata } from "next";

import { LeadCaptureForm } from "@/components/leads/lead-capture-form";
import { isAuthRequiredEnabled } from "@/lib/auth/auth-required";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";

export const metadata: Metadata = { title: "Captura express" };

export default async function NewLeadPage() {
  if (isAuthRequiredEnabled()) await requireAdvisorOrRedirect("/nuevo");
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7 flex items-end justify-between gap-4 sm:mb-10">
        <div>
          <h1 className="mt-1 max-w-xl text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">No dejes que el tráfico se lleve una oportunidad.</h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-[var(--muted)]">Completa lo esencial ahora. El contexto comercial queda listo para tu siguiente conversación.</p>
        </div>
        <span className="hidden shrink-0 rounded-2xl bg-[var(--lime)] px-3 py-2 text-xs font-black text-[var(--ink)] sm:block">01 / 03</span>
      </div>
      <LeadCaptureForm />
    </div>
  );
}
