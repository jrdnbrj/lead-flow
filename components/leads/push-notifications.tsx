"use client";

import { Bell, BellOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { registerLeadFlowServiceWorker, subscribeToLeadFlowPush } from "@/lib/push/browser";

type State = "UNKNOWN" | "ENABLED" | "DISABLED" | "BLOCKED" | "ERROR";

export function PushNotifications() {
  const [state, setState] = useState<State>("UNKNOWN");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(async () => {
      if (!("Notification" in window)) return "DISABLED" as const;
      if (Notification.permission === "denied") return "BLOCKED" as const;
      const registration = await registerLeadFlowServiceWorker();
      if (!registration?.pushManager) return "DISABLED" as const;
      return (await registration.pushManager.getSubscription()) ? "ENABLED" as const : "DISABLED" as const;
    }).then(setState).catch(() => setState("ERROR"));
  }, []);
  if (state === "ENABLED") return <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><Bell size={14} />Recordatorios activados</p>;
  if (state === "BLOCKED") return <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700"><BellOff size={14} />Notificaciones bloqueadas en este navegador</p>;
  return <div className="flex items-center gap-2"><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; if (!key) throw new Error("Push aún no está configurado."); const subscription = await subscribeToLeadFlowPush(key); const response = await fetch("/api/push/subscription", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) }); if (!response.ok) throw new Error("No pudimos guardar este dispositivo."); setState("ENABLED"); } catch (error) { setState("ERROR"); window.alert(error instanceof Error ? error.message : "No pudimos activar los recordatorios."); } finally { setBusy(false); } }} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-xs font-black disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Bell size={14} />}Activar recordatorios</button>{state === "ERROR" ? <span className="text-xs font-semibold text-rose-700">No disponible; puedes reintentar.</span> : null}</div>;
}
