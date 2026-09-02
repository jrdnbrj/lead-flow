import type { Metadata } from "next";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getLeads } from "@/lib/leads/repository";
import { ensureEvolutionWebhook } from "@/lib/whatsapp/service";

export const metadata: Metadata = { title: "Resumen" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ leadId?: string | string[] }> }) {
  const advisorUserId = await requireAdvisorOrRedirect("/dashboard");
  await ensureEvolutionWebhook().catch(() => false);
  const leads = await getLeads(advisorUserId);
  const params = await searchParams;
  const leadId = Array.isArray(params?.leadId) ? params.leadId[0] : params?.leadId;
  return <DashboardClient initialLeads={leads} initialExpandedLeadId={leadId ?? null} initialNowIso={new Date().toISOString()} />;
}
