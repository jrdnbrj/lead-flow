import type { Metadata } from "next";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { isAuthRequiredEnabled } from "@/lib/auth/auth-required";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getLeads } from "@/lib/leads/repository";

export const metadata: Metadata = { title: "Resumen" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (isAuthRequiredEnabled()) await requireAdvisorOrRedirect("/dashboard");
  const leads = await getLeads();
  return <DashboardClient initialLeads={leads} />;
}
