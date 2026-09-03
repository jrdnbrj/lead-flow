import type { Metadata } from "next";

import { PushDiagnostics } from "@/components/push/push-diagnostics";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getInstallationAdvisorUserId } from "@/lib/config/installation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Diagnóstico de recordatorios" };
export const dynamic = "force-dynamic";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  subscription_generation: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type SafeSubscription = {
  id: string;
  endpointFingerprint: string;
  endpointHost: string;
  p256dhPresent: boolean;
  authPresent: boolean;
  subscriptionGeneration: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

async function fingerprint(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function getSafeSubscriptions(): Promise<SafeSubscription[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("PUSH_DIAGNOSTICS_CONFIGURATION_MISSING");
  const ownerId = await getInstallationAdvisorUserId();
  if (!ownerId) throw new Error("PUSH_DIAGNOSTICS_OWNER_MISSING");
  const pushDb = supabase as unknown as { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { order: (column: string, options: { ascending: boolean }) => Promise<{ data: SubscriptionRow[] | null; error: { message?: string } | null }> } } } };
  const { data, error } = await pushDb
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,subscription_generation,status,created_at,updated_at")
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[leadflow][push-diagnostics] subscription lookup failed", { message: error.message });
    throw new Error("PUSH_DIAGNOSTICS_LOOKUP_FAILED");
  }
  return Promise.all((data ?? []).map(async (row) => ({
    id: row.id,
    endpointFingerprint: await fingerprint(row.endpoint),
    endpointHost: (() => { try { return new URL(row.endpoint).host; } catch { return "desconocido"; } })(),
    p256dhPresent: Boolean(row.p256dh),
    authPresent: Boolean(row.auth),
    subscriptionGeneration: row.subscription_generation,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })));
}

export default async function PushDiagnosticsPage() {
  await requireAdvisorOrRedirect("/push-diagnostics");
  return <PushDiagnostics remoteSubscriptions={await getSafeSubscriptions()} />;
}
