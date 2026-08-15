import type { Metadata } from "next";

import { SellerProfileForm } from "@/components/whatsapp/seller-profile-form";
import { MessageTemplateEditor } from "@/components/whatsapp/message-template-editor";
import { WhatsappConnectionSection } from "@/components/whatsapp/whatsapp-connection-section";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { getPersistentSettings } from "@/lib/config/persistent-settings";
import { getEvolutionConnectionStatus, getEvolutionErrorMessage, normalizeEvolutionConnectionState } from "@/lib/whatsapp/service";
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
    return { qr: null, error: "Completa la configuración de Evolution API en las variables de entorno.", state: null };
  }

  try {
    const baseUrl = apiUrl.replace(/\/$/, "");
    const stateUrl = `${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
    const currentConnection = await getEvolutionConnectionStatus();
    if (forceRefresh) {
      if (currentConnection.ready) return { qr: null, error: null, state: "open" };

      const restartResponse = await fetch(`${baseUrl}/instance/restart/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { apikey: apiKey },
        cache: "no-store",
      });
      if (!restartResponse.ok) {
        const payload = await restartResponse.json().catch(() => null);
        return { qr: null, error: getEvolutionErrorMessage(restartResponse.status, payload, "Evolution API no pudo reiniciar la sesión. Verifica que la instancia exista y esté desconectada."), state: currentConnection.state };
      }
    }

    const [response, stateResponse] = await Promise.all([
      fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
        headers: { apikey: apiKey },
        cache: "no-store",
      }),
      fetch(stateUrl, {
        headers: { apikey: apiKey },
        cache: "no-store",
      }),
    ]);
    const payload = await response.json() as ConnectionPayload;
    const statePayload = await stateResponse.json().catch(() => null) as ConnectionStatePayload | null;
    const state = getState(statePayload);
    if (!response.ok) return { qr: null, error: getEvolutionErrorMessage(response.status, payload, "Evolution API no pudo preparar la conexión de WhatsApp."), state };
    const verified = await getEvolutionConnectionStatus();
    if (verified.ready) return { qr: null, error: null, state: "open" };
    return { qr: typeof payload.base64 === "string" ? payload.base64 : null, error: verified.error, state: verified.state || state };
  } catch {
    return { qr: null, error: "No se pudo conectar con Evolution API. Verifica que el servicio esté levantado.", state: null };
  }
}

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ refresh?: string }> }) {
  const params = await searchParams;
  await requireAdvisorOrRedirect(`/whatsapp${params.refresh ? "?refresh=1" : ""}`);
  const connection = await getWhatsappConnection(Boolean(params.refresh));
  const isConnected = connection.state === "open";
  let sellerProfile = null;
  let messageTemplate = null;
  let persistentSettingsAvailable = false;
  if (isConnected) {
    const [profile, template, persistentSettings] = await Promise.all([
      getEffectiveSellerProfile(),
      getEffectiveWhatsappMessageTemplate(),
      getPersistentSettings(),
    ]);
    sellerProfile = profile;
    messageTemplate = template;
    persistentSettingsAvailable = persistentSettings.available;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7 sm:mb-10">
        <p className="eyebrow">WhatsApp · conexión del vendedor</p>
        <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">{isConnected ? "Tu WhatsApp está listo para responder." : "Conecta el número desde el que vas a responder."}</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">{isConnected ? "Configura los datos que compartirás con tus clientes y personaliza el primer mensaje. La vinculación queda al final para que primero tengas a mano lo que usarás." : "Escanea este QR con el celular del vendedor. Cuando quede vinculado aparecerán los datos del cliente y el mensaje automático."}</p>
      </div>

      {isConnected && sellerProfile && messageTemplate ? <>
        <SellerProfileForm initialProfile={sellerProfile} persistentSettingsAvailable={persistentSettingsAvailable} />
        <MessageTemplateEditor initialTemplate={messageTemplate} />
        <div className="mt-8"><p className="eyebrow mb-3">Conexión actual</p><WhatsappConnectionSection connection={connection} /></div>
      </> : <WhatsappConnectionSection connection={connection} />}
    </div>
  );
}
