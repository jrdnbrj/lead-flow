import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, CircleAlert, LayoutDashboard, MessageCircle } from "lucide-react";

import { SellerProfileForm } from "@/components/whatsapp/seller-profile-form";
import { MessageTemplateEditor } from "@/components/whatsapp/message-template-editor";
import { RefreshQrButton } from "@/components/whatsapp/refresh-qr-button";
import { UnlinkWhatsappButton } from "@/components/whatsapp/unlink-button";
import { requireAdvisorOrRedirect } from "@/lib/auth/advisor";
import { getEffectiveSellerProfile } from "@/lib/config/seller";
import { getEffectiveWhatsappMessageTemplate } from "@/lib/config/message-template";
import { getPersistentSettings } from "@/lib/config/persistent-settings";
import { getEvolutionConnectionStatus, getEvolutionErrorMessage } from "@/lib/whatsapp/service";

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

type WhatsappConnection = { qr: string | null; error: string | null; state: string | null };

function getState(payload: ConnectionStatePayload | null): string | null {
  const state = payload?.instance?.state ?? payload?.state ?? null;
  return typeof state === "string" ? state.toLowerCase() : null;
}

async function getWhatsappConnection(forceRefresh = false): Promise<{ qr: string | null; error: string | null; state: string | null }> {
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

function stateCopy(state: string | null): { title: string; description: string; className: string } {
  if (state === "open") return { title: "WhatsApp conectado", description: "La cuenta está vinculada y lista para enviar mensajes desde el resumen de contactos.", className: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  if (state === "connecting") return { title: "Esperando vinculación", description: "Escanea el QR con WhatsApp en tu celular. El estado cambiará automáticamente cuando termine.", className: "border-amber-200 bg-amber-50 text-amber-900" };
  if (state === "close") return { title: "WhatsApp desconectado", description: "La instancia está disponible, pero todavía no hay un celular vinculado. Genera un QR nuevo.", className: "border-amber-200 bg-amber-50 text-amber-900" };
  return { title: "Estado no disponible", description: "No pudimos confirmar el estado de la cuenta. Actualiza la página para volver a consultarlo.", className: "border-black/10 bg-[#faf9f6] text-[var(--ink)]" };
}

function WhatsappConnectionSection({ connection }: { connection: WhatsappConnection }) {
  const status = stateCopy(connection.state);
  const isConnected = connection.state === "open";

  return <section className="rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-8">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#dff7e7] text-[#11743d]"><MessageCircle size={21} /></span>
      <div>
        <h2 className="text-lg font-black">Vinculación de WhatsApp</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">WhatsApp → Dispositivos vinculados → Vincular un dispositivo.</p>
      </div>
    </div>

    <div className={`mt-6 flex items-start gap-3 rounded-2xl border px-4 py-4 ${status.className}`}>
      {isConnected ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> : <CircleAlert size={20} className="mt-0.5 shrink-0" />}
      <div><p className="font-black">{status.title}</p><p className="mt-1 text-sm font-semibold opacity-80">{connection.error || status.description}</p></div>
    </div>

    {connection.qr && !isConnected ? (
      <div className="mt-7 flex flex-col items-center">
        <div className="rounded-[24px] bg-white p-3 shadow-[0_10px_30px_rgba(16,24,40,0.1)] ring-1 ring-black/[0.06]"><Image src={connection.qr} alt="Código QR para conectar WhatsApp" width={320} height={320} unoptimized className="size-64 sm:size-80" /></div>
        <p className="mt-5 text-center text-sm font-bold text-[var(--muted)]">Este código caduca. Si no escanea, genera otro QR y vuelve a intentarlo de inmediato.</p>
      </div>
    ) : null}

    <div className="mt-7 flex flex-wrap items-center gap-2">
      <RefreshQrButton label={isConnected ? "Actualizar estado" : "Generar QR nuevo"} />
      {isConnected ? <UnlinkWhatsappButton /> : null}
      <a href="/dashboard" className="button-secondary"><LayoutDashboard size={17} />Ir al dashboard</a>
    </div>
  </section>;
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
