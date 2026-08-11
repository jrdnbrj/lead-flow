import { redirect } from "next/navigation";

import { getInstallationAdvisorUserId } from "@/lib/config/installation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUTH_REQUIRED } from "@/lib/auth/auth-required";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdvisorAuthorization =
  | { status: "AUTHORIZED"; advisorUserId: string }
  | { status: typeof AUTH_REQUIRED; reason: "NO_SUPABASE" | "NO_SESSION" | "INVALID_CLAIMS" | "INSTALLATION_MISSING" | "ADVISOR_MISMATCH" };

function authRequired(reason: AdvisorAuthorization extends infer T ? T extends { reason: infer R } ? R : never : never): AdvisorAuthorization {
  return { status: AUTH_REQUIRED, reason };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export async function requireAdvisor(): Promise<AdvisorAuthorization> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return authRequired("NO_SUPABASE");

  const { data, error } = await supabase.auth.getClaims();
  if (error) return authRequired("NO_SESSION");

  const subject = data?.claims?.sub;
  if (!isUuid(subject)) return authRequired("INVALID_CLAIMS");

  const advisorUserId = await getInstallationAdvisorUserId();
  if (!isUuid(advisorUserId)) return authRequired("INSTALLATION_MISSING");
  if (advisorUserId !== subject) return authRequired("ADVISOR_MISMATCH");

  return { status: "AUTHORIZED", advisorUserId };
}

export async function requireAdvisorOrRedirect(nextPath: string): Promise<string> {
  const authorization = await requireAdvisor();
  if (authorization.status === "AUTHORIZED") return authorization.advisorUserId;

  const next = encodeURIComponent(nextPath.startsWith("/") ? nextPath : "/dashboard");
  redirect(`/login?next=${next}`);
}
