"use server";

import type { ActionResponse } from "@/lib/domain/lead";
import { authRequiredResult } from "@/lib/auth/auth-required";
import { requireAdvisor } from "@/lib/auth/advisor";
import { ensureEvolutionWebhook, getEvolutionConnectionQr, getEvolutionConnectionStatus, getEvolutionErrorMessage, recreateEvolutionInstanceAfterCleanup, resetEvolutionInstanceForPairing, waitForEvolutionPairingState } from "@/lib/whatsapp/service";

export async function getWhatsappConnectionStatusAction() {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return { state: null, ready: false, error: "Tu sesión ya no está activa. Inicia sesión nuevamente." };
  const status = await getEvolutionConnectionStatus();
  if (status.ready && !(await ensureEvolutionWebhook())) {
    return { ...status, error: "WhatsApp está vinculado, pero no pudimos dejar lista la recepción de mensajes. Intenta actualizar de nuevo." };
  }
  return status;
}

export async function getWhatsappConnectionQrAction() {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return { qr: null, state: null, error: "Tu sesión ya no está activa. Inicia sesión nuevamente." };
  return getEvolutionConnectionQr();
}

export async function unlinkWhatsappInstanceAction(): Promise<ActionResponse<{ disconnected: true }>> {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return authRequiredResult();

  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_API_INSTANCE_NAME;
  if (!apiUrl || !apiKey || !instanceName) return { success: false, error: "No pudimos preparar la desconexión de WhatsApp. Intenta de nuevo y avísame si continúa." };

  try {
    const baseUrl = apiUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: { apikey: apiKey },
      cache: "no-store",
    });
    if (response.ok) {
      const pairing = await waitForEvolutionPairingState();
      if (!pairing.ready) {
        return { success: false, error: "WhatsApp todavía está cerrando la conexión. Intenta de nuevo en unos segundos." };
      }
      if (pairing.hasQr) return { success: true, data: { disconnected: true } };
      const reset = await resetEvolutionInstanceForPairing();
      if (!reset.ok) return { success: false, error: reset.error || "No pudimos preparar el QR nuevo. Intenta de nuevo." };
      return { success: true, data: { disconnected: true } };
    }

    const logoutPayload = await response.json().catch(() => null);
    const logoutError = getEvolutionErrorMessage(response.status, logoutPayload, "No pudimos desconectar WhatsApp. Intenta de nuevo.");
    // A session removed from WhatsApp can remain in Evolution as a zombie:
    // logout fails because Baileys is already closed. Delete and recreate that
    // instance so the next visit can produce a fresh QR.
    const logoutText = JSON.stringify(logoutPayload).toLowerCase();
    const staleSession = response.status === 428 || response.status === 500 || (response.status === 400 && (logoutText.includes("not connected") || logoutText.includes("connection closed") || logoutText.includes("already closed")));
    if (staleSession) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const deleteResponse = await fetch(`${baseUrl}/instance/delete/${encodeURIComponent(instanceName)}`, {
          method: "DELETE",
          headers: { apikey: apiKey },
          cache: "no-store",
        });
        if (deleteResponse.ok || deleteResponse.status === 404) {
          const ensured = await recreateEvolutionInstanceAfterCleanup();
          if (ensured.ok) return { success: true, data: { disconnected: true } };
          return { success: false, error: ensured.error || "La conexión se reinició, pero no pudimos dejarla lista. Intenta de nuevo." };
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750));
      }

      // Evolution 2.3.x can report an error after the instance was already
      // removed. Verify the authoritative state before showing a failure.
      const afterDelete = await getEvolutionConnectionStatus();
      if (afterDelete.missingInstance) {
        const ensured = await recreateEvolutionInstanceAfterCleanup();
        if (ensured.ok) return { success: true, data: { disconnected: true } };
      }

      return { success: false, error: "No pudimos limpiar la conexión cerrada. Intenta de nuevo." };
    }
    return { success: false, error: logoutError };
  } catch {
    return { success: false, error: "No pudimos desconectar WhatsApp. Revisa tu conexión e inténtalo de nuevo." };
  }
}
