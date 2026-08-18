import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const timeout = 3000;

async function checkSupabase(): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("leadflow_installation")
    .select("singleton")
    .eq("singleton", true)
    .limit(1);

  return !error;
}

async function checkEvolution(): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!apiUrl || !apiKey) return false;

  try {
    const response = await fetch(`${apiUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [supabaseReady, evolutionReady] = await Promise.all([
    checkSupabase(),
    checkEvolution(),
  ]);
  const ready = supabaseReady && evolutionReady;

  return Response.json(
    {
      success: ready,
      data: {
        service: "leadflow",
        status: ready ? "ready" : "not_ready",
        dependencies: {
          supabase: supabaseReady ? "ready" : "unavailable",
          evolution: evolutionReady ? "ready" : "unavailable",
        },
      },
    },
    {
      status: ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
