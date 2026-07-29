"use server";

import type { ActionResponse } from "@/lib/domain/lead";

export async function unlinkWhatsappInstanceAction(): Promise<ActionResponse<{ disconnected: true }>> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_API_INSTANCE_NAME;
  if (!apiUrl || !apiKey || !instanceName) return { success: false, error: "Evolution API no está configurada para desvincular WhatsApp." };

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey: apiKey },
      cache: "no-store",
    });
    if (!response.ok) return { success: false, error: "No pudimos desvincular WhatsApp. Intenta nuevamente en unos segundos." };
    return { success: true, data: { disconnected: true } };
  } catch {
    return { success: false, error: "No se pudo contactar Evolution API para desvincular WhatsApp." };
  }
}
