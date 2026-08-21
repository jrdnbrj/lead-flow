import { NextResponse } from "next/server";

import { requireAdvisor } from "@/lib/auth/advisor";
import { resolveScheduleShortcut, type ScheduleShortcut } from "@/lib/leads/follow-up";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PushQuery = { maybeSingle: () => Promise<{ data: { action_id: string } | null }>; eq: (column: string, value: unknown) => PushQuery };
type PushDb = { from: (table: string) => { select: (columns: string) => PushQuery }; rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: Error | null }> };

const commands = new Set(["DONE", "IGNORE", "POSTPONE_PLUS_ONE_HOUR", "POSTPONE_LATER", "POSTPONE_TOMORROW", "POSTPONE_IN_THREE_DAYS"]);

function redirectTo(path: string) {
  // Keep the browser's public origin. Behind Docker/Caddy, request.url can
  // reflect the internal Next.js host (for example 0.0.0.0:3000).
  return new NextResponse(null, { status: 303, headers: { location: path } });
}

export async function GET(request: Request) {
  const auth = await requireAdvisor();
  if (auth.status !== "AUTHORIZED") return redirectTo("/login?next=/dashboard");
  const url = new URL(request.url);
  const deliveryId = url.searchParams.get("deliveryId");
  const command = url.searchParams.get("command");
  const actionVersion = Number(url.searchParams.get("actionVersion"));
  if (!deliveryId || !command || !commands.has(command) || !Number.isInteger(actionVersion)) return redirectTo("/dashboard?push=invalid");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirectTo("/dashboard?push=unavailable");
  const pushDb = supabase as unknown as PushDb;
  const { data: delivery } = await pushDb.from("push_deliveries").select("action_id").eq("id", deliveryId).eq("user_id", auth.advisorUserId).maybeSingle();
  if (!delivery) return redirectTo("/dashboard?push=stale");
  const status = command === "DONE" ? "DONE" : command === "IGNORE" ? "IGNORED" : "POSTPONED";
  const shortcut = (command === "POSTPONE_PLUS_ONE_HOUR" || command === "POSTPONE_LATER" || command === "POSTPONE_TOMORROW" || command === "POSTPONE_IN_THREE_DAYS" ? command : null) as ScheduleShortcut | null;
  const scheduledFor = shortcut ? resolveScheduleShortcut(shortcut) : null;
  const { error } = await pushDb.rpc("transition_lead_follow_up_action_v1", { p_action_id: delivery.action_id, p_status: status, p_expected_action_version: actionVersion, p_scheduled_for: scheduledFor ?? undefined, p_note: undefined, p_idempotency_key: `push-${deliveryId}-${command}-${actionVersion}`, p_cancel_reason: "PUSH_COMMAND" });
  return redirectTo(`/dashboard?push=${error ? "error" : "applied"}`);
}
