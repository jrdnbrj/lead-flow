import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;
const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" };
const query = async (path: string, init?: RequestInit) => fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } });

const unauthorized = () => new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "content-type": "application/json" } });

function formatPushSchedule(scheduledFor: string): string {
  const target = new Date(scheduledFor);
  const now = new Date();
  const date = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    day: "numeric",
    month: "short",
  }).format(target).replace(".", "");
  const time = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(target);
  const targetDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(target);
  const currentDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return targetDay === currentDay ? `Hoy · ${time}` : `${date} · ${time}`;
}

function describeProviderError(error: unknown): { statusCode?: number; name: string; message: string } {
  const candidate = error as { statusCode?: unknown; name?: unknown; message?: unknown };
  const statusCode = typeof candidate?.statusCode === "number" ? candidate.statusCode : undefined;
  const name = typeof candidate?.name === "string" ? candidate.name : "UNKNOWN_ERROR";
  const rawMessage = typeof candidate?.message === "string" ? candidate.message : "";
  const message = rawMessage
    .replace(/https?:\/\/[^\s)]+/gi, "[provider-url]")
    .replace(/[A-Za-z0-9+/=_-]{32,}/g, "[redacted]")
    .slice(0, 180);
  return { statusCode, name, message };
}

function providerStatus(response: unknown): string {
  const statusCode = (response as { statusCode?: unknown })?.statusCode;
  return typeof statusCode === "number" ? String(statusCode) : "ACCEPTED";
}

Deno.serve(async (request) => {
  if (request.method !== "POST" || !dispatchSecret || request.headers.get("authorization") !== `Bearer ${dispatchSecret}`) return unauthorized();
  const materialized = await fetch(`${supabaseUrl}/rest/v1/rpc/materialize_push_deliveries_v1`, { method: "POST", headers, body: JSON.stringify({ p_now: new Date().toISOString() }) });
  if (!materialized.ok) return new Response(JSON.stringify({ error: "MATERIALIZE_FAILED" }), { status: 502 });
  const due = await query("push_deliveries?status=eq.SCHEDULED&scheduled_for=lte." + encodeURIComponent(new Date().toISOString()) + "&select=*");
  if (!due.ok) return new Response(JSON.stringify({ error: "DELIVERIES_UNAVAILABLE" }), { status: 502 });
  const deliveries = await due.json();
  const results = [];
  for (const delivery of deliveries) {
    const subscriptionResponse = await query(`push_subscriptions?id=eq.${delivery.subscription_id}&status=eq.ACTIVE&select=endpoint,p256dh,auth`);
    const [storedSubscription] = await subscriptionResponse.json();
    if (!storedSubscription) continue;
    const subscription = {
      endpoint: storedSubscription.endpoint,
      keys: {
        p256dh: storedSubscription.p256dh,
        auth: storedSubscription.auth,
      },
    };
    await query(`push_deliveries?id=eq.${delivery.id}&status=eq.SCHEDULED`, { method: "PATCH", body: JSON.stringify({ status: "CLAIMED", claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    const actionLabels: Record<string, string> = { CALL: "Llamar", WHATSAPP: "Escribir por WhatsApp", QUOTE: "Cotizar", OTHER: "Dar seguimiento", RESPONSE: "Responder" };
    const actionLabel = actionLabels[delivery.action_type] || "Dar seguimiento";
    const payload = JSON.stringify({ title: delivery.lead_name || "Seguimiento pendiente", body: `${actionLabel} · ${formatPushSchedule(delivery.scheduled_for)}`, tag: `leadflow-${delivery.id}`, deliveryId: delivery.id, actionVersion: delivery.action_version, openUrl: "/dashboard" });
    try {
      const response = await webpush.sendNotification(subscription, payload, { TTL: 3600, urgency: "high" });
      const acceptedAt = new Date().toISOString();
      const acceptedProviderStatus = providerStatus(response);
      console.info("push_provider_accepted", JSON.stringify({
        deliveryId: delivery.id,
        actionId: delivery.action_id,
        actionVersion: delivery.action_version,
        subscriptionId: delivery.subscription_id,
        subscriptionGeneration: delivery.subscription_generation,
        endpointHost: new URL(subscription.endpoint).host,
        payloadBytes: new TextEncoder().encode(payload).byteLength,
        ttl: 3600,
        urgency: "high",
        topic: null,
        contentEncoding: "aes128gcm",
        providerStatus: acceptedProviderStatus,
        sentAt: acceptedAt,
        effectId: delivery.effect_id,
      }));
      await query(`push_deliveries?id=eq.${delivery.id}`, { method: "PATCH", body: JSON.stringify({ status: "ACCEPTED", provider_status: acceptedProviderStatus, sent_at: acceptedAt, updated_at: acceptedAt }) });
      results.push({ id: delivery.id, status: "ACCEPTED", providerStatus: acceptedProviderStatus });
    } catch (error) {
      const detail = describeProviderError(error);
      const statusCode = detail.statusCode;
      const status = statusCode === 404 || statusCode === 410 ? "FAILED" : "UNKNOWN";
      const providerStatus = statusCode ? String(statusCode) : `ERROR:${detail.name}${detail.message ? `:${detail.message}` : ""}`;
      console.error("push_provider_failed", JSON.stringify({ status, statusCode, name: detail.name, message: detail.message }));
      await query(`push_deliveries?id=eq.${delivery.id}`, { method: "PATCH", body: JSON.stringify({ status, provider_status: providerStatus, updated_at: new Date().toISOString() }) });
      if (statusCode === 404 || statusCode === 410) await query(`push_subscriptions?id=eq.${delivery.subscription_id}`, { method: "PATCH", body: JSON.stringify({ status: "INVALIDATED", invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      results.push({ id: delivery.id, status });
    }
  }
  return new Response(JSON.stringify({ materialized: true, results }), { headers: { "content-type": "application/json" } });
});
