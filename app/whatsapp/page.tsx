import type { Metadata } from "next";
import Image from "next/image";
import { MessageCircle, RefreshCw, Smartphone } from "lucide-react";

export const metadata: Metadata = { title: "Conectar WhatsApp" };
export const dynamic = "force-dynamic";

type ConnectionPayload = {
  base64?: string;
  pairingCode?: string | null;
  count?: number;
};

async function getWhatsappConnection(): Promise<{ qr: string | null; error: string | null }> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_API_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instanceName) {
    return { qr: null, error: "Completa la configuración de Evolution API en las variables de entorno." };
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });
    const payload = await response.json() as ConnectionPayload;
    if (!response.ok) return { qr: null, error: "Evolution API no pudo generar el QR de conexión." };
    return { qr: typeof payload.base64 === "string" ? payload.base64 : null, error: null };
  } catch {
    return { qr: null, error: "No se pudo conectar con Evolution API. Verifica que el servicio esté levantado." };
  }
}

export default async function WhatsappPage() {
  const connection = await getWhatsappConnection();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7 sm:mb-10">
        <p className="eyebrow">WhatsApp · conexión del vendedor</p>
        <h1 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] sm:text-6xl">Conecta el número desde el que vas a responder.</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">Escanea este QR con el celular del vendedor. Después, el botón Enviar del pipeline usará esa sesión para enviar el mensaje automáticamente.</p>
      </div>

      <section className="rounded-[30px] border border-black/[0.06] bg-white p-5 shadow-[0_16px_50px_rgba(16,24,40,0.06)] sm:p-8">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#dff7e7] text-[#11743d]"><MessageCircle size={21} /></span>
          <div>
            <h2 className="text-lg font-black">Vinculación de WhatsApp</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">WhatsApp → Dispositivos vinculados → Vincular un dispositivo.</p>
          </div>
        </div>

        {connection.qr ? (
          <div className="mt-7 flex flex-col items-center">
            <div className="rounded-[24px] bg-white p-3 shadow-[0_10px_30px_rgba(16,24,40,0.1)] ring-1 ring-black/[0.06]"><Image src={connection.qr} alt="Código QR para conectar WhatsApp" width={320} height={320} unoptimized className="size-64 sm:size-80" /></div>
            <p className="mt-5 text-center text-sm font-bold text-[var(--muted)]">El QR caduca. Si no funciona, actualiza esta pantalla y escanea el nuevo.</p>
          </div>
        ) : (
          <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">{connection.error || "La instancia ya está conectada o no tiene un QR disponible."}</div>
        )}

        <div className="mt-7 flex flex-wrap gap-2">
          <a href="/whatsapp" className="button-primary"><RefreshCw size={17} />Actualizar QR</a>
          <a href="/dashboard" className="button-secondary"><Smartphone size={17} />Volver al pipeline</a>
        </div>
      </section>
    </div>
  );
}
