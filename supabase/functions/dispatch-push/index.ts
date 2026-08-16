import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" };
const query = async (path: string, init?: RequestInit) => fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } });

Deno.serve(async () => {
  const materialized = await fetch(`${supabaseUrl}/rest/v1/rpc/materialize_push_deliveries_v1`, { method: "POST", headers, body: JSON.stringify({ p_now: new Date().toISOString() }) });
  if (!materialized.ok) return new Response(JSON.stringify({ error: "MATERIALIZE_FAILED" }), { status: 502 });
  const due = await query("push_deliveries?status=eq.SCHEDULED&scheduled_for=lte." + encodeURIComponent(new Date().toISOString()) + "&select=*");
  if (!due.ok) return new Response(JSON.stringify({ error: "DELIVERIES_UNAVAILABLE" }), { status: 502 });
  const deliveries = await due.json();
  const results = [];
  for (const delivery of deliveries) {
    const subscriptionResponse = await query(`push_subscriptions?id=eq.${delivery.subscription_id}&status=eq.ACTIVE&select=endpoint,p256dh,auth`);
    const [subscription] = await subscriptionResponse.json();
    if (!subscription) continue;
    await query(`push_deliveries?id=eq.${delivery.id}&status=eq.SCHEDULED`, { method: "PATCH", body: JSON.stringify({ status: "CLAIMED", claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    const payload = JSON.stringify({ title: delivery.lead_name || "Seguimiento pendiente", body: "Tienes una acción pendiente en LeadFlow.", tag: `leadflow-${delivery.id}`, deliveryId: delivery.id, actionVersion: delivery.action_version, openUrl: "/dashboard" });
    try {
      await webpush.sendNotification(subscription, payload);
      await query(`push_deliveries?id=eq.${delivery.id}`, { method: "PATCH", body: JSON.stringify({ status: "ACCEPTED", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      results.push({ id: delivery.id, status: "ACCEPTED" });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      const status = statusCode === 404 || statusCode === 410 ? "FAILED" : "UNKNOWN";
      await query(`push_deliveries?id=eq.${delivery.id}`, { method: "PATCH", body: JSON.stringify({ status, provider_status: String(statusCode || "UNKNOWN"), updated_at: new Date().toISOString() }) });
      if (statusCode === 404 || statusCode === 410) await query(`push_subscriptions?id=eq.${delivery.subscription_id}`, { method: "PATCH", body: JSON.stringify({ status: "INVALIDATED", invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      results.push({ id: delivery.id, status });
    }
  }
  return new Response(JSON.stringify({ materialized: true, results }), { headers: { "content-type": "application/json" } });
});
