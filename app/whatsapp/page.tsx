import type { Metadata } from "next";

import { SellerProfileForm } from "@/components/whatsapp/seller-profile-form";
import { MessageTemplateEditor } from "@/components/whatsapp/message-template-editor";
import { WhatsappConnectionSection } from "@/components/whatsapp/whatsapp-connection-section";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getWhatsappPageSettings } from "@/lib/config/whatsapp-page";
import { ensureEvolutionInstance, ensureEvolutionWebhook, extractEvolutionQr, getEvolutionConnectionStatus, getEvolutionErrorMessage, normalizeEvolutionConnectionState, resetEvolutionInstanceForPairing, waitForEvolutionPairingState } from "@/lib/whatsapp/service";
import type { EvolutionConnectionState } from "@/lib/whatsapp/service";

export const metadata: Metadata = { title: "Conectar WhatsApp" };
export const dynamic = "force-dynamic";

type ConnectionPayload = {
  base64?: string;
  pairingCode?: string | null;
  count?: number;
};

type ConnectionStatePayload = {
  instance?: { state?: string };
  state?: string;
};

type WhatsappConnection = { qr: string | null; error: string | null; state: EvolutionConnectionState | null };

function getState(payload: ConnectionStatePayload | null): EvolutionConnectionState {
  const state = payload?.instance?.state ?? payload?.state ?? null;
  return normalizeEvolutionConnectionState(state);
}

async function getWhatsappConnection(forceRefresh = false): Promise<WhatsappConnection> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_API_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instanceName) {
    return { qr: null, error: "La conexión de WhatsApp no está disponible. Intenta de nuevo y avísame si continúa.", state: null };
  }

  try {
    const baseUrl = apiUrl.replace(/\/$/, "");
    const stateUrl = `${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
    let currentConnection = await getEvolutionConnectionStatus();
    let instanceWasCreated = false;
    if (currentConnection.missingInstance) {
      // A missing instance is a recoverable first-visit state. Create it on
      // the server and continue to the provider QR so a normal page reload
      // can recover production without requiring a second hidden action.
      const ensured = await ensureEvolutionInstance();
      if (!ensured.ok) return { qr: null, error: ensured.error, state: currentConnection.state };
      instanceWasCreated = true;
      currentConnection = await getEvolutionConnectionStatus();
    }
    if (forceRefresh && currentConnection.state === "close") {
      const reset = await resetEvolutionInstanceForPairing();
      if (!reset.ok) return { qr: null, error: reset.error, state: currentConnection.state };
      instanceWasCreated = true;
      currentConnection = await getEvolutionConnectionStatus();
    }
    if (forceRefresh && currentConnection.state === "connecting") {
      // Evolution may already be preparing the QR after logout. Do not
      // restart/delete that session; request the current QR below.
      instanceWasCreated = true;
    }
    if (forceRefresh && !instanceWasCreated) {
      if (currentConnection.ready) {
        const pairing = await waitForEvolutionPairingState();
        if (!pairing.ready) return { qr: null, error: "WhatsApp todavía está cerrando la conexión. Intenta actualizar en unos segundos.", state: "open" };
        currentConnection = await getEvolutionConnectionStatus();
        if (pairing.hasQr || currentConnection.state === "connecting") instanceWasCreated = true;
      }

      const restartResponse = instanceWasCreated ? null : await fetch(`${baseUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { apikey: apiKey },
        cache: "no-store",
      });
      if (restartResponse && !restartResponse.ok) {
        if (restartResponse.status === 404) {
          const ensured = await ensureEvolutionInstance();
          if (!ensured.ok) return { qr: null, error: ensured.error, state: currentConnection.state };
        } else if (restartResponse.status === 428 || restartResponse.status === 500) {
          const reset = await resetEvolutionInstanceForPairing();
          if (!reset.ok) return { qr: null, error: reset.error, state: currentConnection.state };
          instanceWasCreated = true;
        } else {
          const payload = await restartResponse.json().catch(() => null);
          return { qr: null, error: getEvolutionErrorMessage(restartResponse.status, payload, "No pudimos reiniciar la conexión de WhatsApp. Intenta de nuevo."), state: currentConnection.state };
        }
      }
    }

    let [response, stateResponse] = await Promise.all([
      fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: apiKey },
        cache: "no-store",
      }),
      fetch(stateUrl, {
        headers: { apikey: apiKey },
        cache: "no-store",
      }),
    ]);
    if (forceRefresh && (response.status === 404 || response.status === 428 || response.status === 500)) {
      const reset = await resetEvolutionInstanceForPairing();
      if (!reset.ok) return { qr: null, error: reset.error, state: currentConnection.state };
      [response, stateResponse] = await Promise.all([
        fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, { headers: { apikey: apiKey }, cache: "no-store" }),
        fetch(stateUrl, { headers: { apikey: apiKey }, cache: "no-store" }),
      ]);
    }
    if (response.status === 409) {
      const verified = await getEvolutionConnectionStatus();
      if (verified.ready) {
        const webhookReady = await ensureEvolutionWebhook();
        return { qr: null, error: webhookReady ? null : "WhatsApp está vinculado, pero no pudimos dejar lista la recepción de mensajes. Intenta actualizar de nuevo.", state: "open" };
      }
    }
    const payload = await response.json() as ConnectionPayload;
    const statePayload = await stateResponse.json().catch(() => null) as ConnectionStatePayload | null;
    const state = getState(statePayload);
    if (!response.ok) return { qr: null, error: getEvolutionErrorMessage(response.status, payload, "No pudimos preparar la conexión de WhatsApp. Intenta de nuevo."), state };
    const verified = await getEvolutionConnectionStatus();
    if (verified.ready) {
      const webhookReady = await ensureEvolutionWebhook();
      return { qr: null, error: webhookReady ? null : "WhatsApp está vinculado, pero no pudimos dejar lista la recepción de mensajes. Intenta actualizar de nuevo.", state: "open" };
    }
    const qr = extractEvolutionQr(payload);
    return { qr, error: qr ? null : verified.error, state: qr ? "connecting" : verified.state || state };
  } catch {
    return { qr: null, error: "No pudimos conectar WhatsApp. Revisa tu conexión e inténtalo de nuevo.", state: null };
  }
}

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ refresh?: string }> }) {
  const params = await searchParams;
  await requireAdvisorOrRedirect(`/whatsapp${params.refresh ? "?refresh=1" : ""}`);
  const connection = await getWhatsappConnection(Boolean(params.refresh));
  const isConnected = connection.state === "open";
  let sellerProfile = null;
  let messageTemplate = null;
  if (isConnected) {
    const settings = await getWhatsappPageSettings();
    sellerProfile = settings.sellerProfile;
    messageTemplate = settings.messageTemplate;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7 sm:mb-10">
        <p className="eyebrow">WhatsApp · conexión del asesor</p>
        <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{isConnected ? "WhatsApp del asesor conectado." : "Conecta el WhatsApp del asesor."}</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">{isConnected ? "Administra aquí los datos que compartes y el mensaje inicial." : "Escanea este QR con el celular del asesor."}</p>
      </div>

      {isConnected && sellerProfile && messageTemplate ? <>
        <SellerProfileForm initialProfile={sellerProfile} />
        <MessageTemplateEditor initialTemplate={messageTemplate} />
        <div className="mt-8"><p className="eyebrow mb-3">Conexión actual</p><WhatsappConnectionSection connection={connection} /></div>
      </> : <WhatsappConnectionSection connection={connection} />}
    </div>
  );
}
