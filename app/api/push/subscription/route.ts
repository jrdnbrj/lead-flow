import { NextResponse } from "next/server";

import { requireAdvisor } from "@/lib/auth/advisor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PushDb = { rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: Error | null }> };

export async function POST(request: Request) {
  const auth = await requireAdvisor();
  if (auth.status !== "AUTHORIZED") return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const body = await request.json().catch(() => null) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys.auth) return NextResponse.json({ error: "PUSH_SUBSCRIPTION_INVALID" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });
  const pushDb = supabase as unknown as PushDb;
  const { error } = await pushDb.rpc("upsert_push_subscription_v1", { p_endpoint: body.endpoint, p_p256dh: body.keys.p256dh, p_auth: body.keys.auth });
  if (error) return NextResponse.json({ error: "PUSH_SUBSCRIPTION_FAILED" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
