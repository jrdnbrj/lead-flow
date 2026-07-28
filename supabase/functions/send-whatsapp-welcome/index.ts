import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type WhatsappStatus = "PENDING" | "SENT" | "FAILED";

interface LeadRecord {
  id: string;
  full_name: string;
  phone: string;
  car_model: string;
  whatsapp_attempts?: number;
}

interface DatabaseWebhookPayload {
  type: "INSERT" | "UPDATE";
  table: string;
  record: LeadRecord;
}

interface EvolutionResponse {
  key?: { id?: string };
  message?: { conversation?: string };
}

type AdminClient = SupabaseClient<Record<string, never>>;

function isWebhookPayload(value: unknown): value is DatabaseWebhookPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const lead = record.record;
  if (typeof lead !== "object" || lead === null) return false;
  const leadRecord = lead as Record<string, unknown>;
  return (record.type === "INSERT" || record.type === "UPDATE") && typeof leadRecord.id === "string" && typeof leadRecord.full_name === "string" && typeof leadRecord.phone === "string" && typeof leadRecord.car_model === "string";
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("57") ? digits : `57${digits}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function updateWhatsappStatus(client: AdminClient, leadId: string, status: WhatsappStatus, attempts: number, errorMessage?: string): Promise<void> {
  const payload: Record<string, string | number | null> = {
    whatsapp_status: status,
    whatsapp_attempts: attempts,
    whatsapp_last_error: errorMessage ?? null,
  };
  if (status === "SENT") payload.whatsapp_sent_at = new Date().toISOString();
  await client.from("leads").update(payload).eq("id", leadId);
}

Deno.serve(async (request: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instanceName = Deno.env.get("EVOLUTION_API_INSTANCE_NAME");

  if (!supabaseUrl || !serviceRoleKey || !evolutionUrl || !evolutionApiKey || !instanceName) {
    console.error(JSON.stringify({ event: "whatsapp_config_missing", required: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EVOLUTION_API_URL", "EVOLUTION_API_KEY", "EVOLUTION_API_INSTANCE_NAME"] }));
    return jsonResponse({ success: false, error: "Missing function configuration" }, 500);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON payload" }, 400);
  }
  if (!isWebhookPayload(payload)) return jsonResponse({ success: false, error: "Invalid database webhook payload" }, 400);

  const client = createClient<Record<string, never>>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const lead = payload.record;
  const endpoint = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instanceName)}`;
  const text = `Hola ${lead.full_name.split(" ")[0]}, soy tu asesor. Gracias por visitarnos. Te escribo para seguir con la información de tu ${lead.car_model}.`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
      body: JSON.stringify({ number: normalizePhone(lead.phone), text, delay: 0 }),
    });
    if (!response.ok) throw new Error(`Evolution API responded with ${response.status}`);
    const evolutionResponse: unknown = await response.json() as EvolutionResponse;
    console.info(JSON.stringify({ event: "whatsapp_welcome_sent", leadId: lead.id, response: evolutionResponse }));
    await updateWhatsappStatus(client, lead.id, "SENT", (lead.whatsapp_attempts ?? 0) + 1);
    return jsonResponse({ success: true, data: { leadId: lead.id, status: "SENT" } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Evolution API error";
    console.error(JSON.stringify({ event: "whatsapp_welcome_failed", leadId: lead.id, error: errorMessage }));
    await updateWhatsappStatus(client, lead.id, "FAILED", (lead.whatsapp_attempts ?? 0) + 1, errorMessage);
    return jsonResponse({ success: false, data: { leadId: lead.id, status: "FAILED" }, error: errorMessage });
  }
});
