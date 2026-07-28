import type { Metadata } from "next";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getLeads } from "@/lib/leads/repository";

export const metadata: Metadata = { title: "Resumen" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const leads = await getLeads();
  return <DashboardClient initialLeads={leads} />;
}
