"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RefreshQrButton } from "@/components/whatsapp/refresh-qr-button";
import { UnlinkWhatsappButton } from "@/components/whatsapp/unlink-button";
import { getWhatsappConnectionStatusAction } from "@/lib/whatsapp/actions";
import type { EvolutionConnectionState } from "@/lib/whatsapp/service";

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 12;

type WhatsappConnection = {
  qr: string | null;
  error: string | null;
  state: EvolutionConnectionState | null;
};

function stateCopy(state: EvolutionConnectionState | null): { title: string; description: string; className: string } {
  if (state === "open") return { title: "WhatsApp conectado", description: "La cuenta está vinculada y lista para enviar mensajes desde el resumen de contactos.", className: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  if (state === "connecting") return { title: "Esperando vinculación", description: "Escanea el QR con WhatsApp en tu celular. El estado cambiará automáticamente cuando termine.", className: "border-amber-200 bg-amber-50 text-amber-900" };
  if (state === "close") return { title: "WhatsApp desconectado", description: "Todavía no hay un celular vinculado. Genera un código QR nuevo.", className: "border-amber-200 bg-amber-50 text-amber-900" };
  return { title: "Estado no disponible", description: "No pudimos confirmar el estado de la cuenta. Actualiza la página para volver a consultarlo.", className: "border-black/10 bg-[#faf9f6] text-[var(--ink)]" };
}

export function WhatsappConnectionSection({ connection }: { connection: WhatsappConnection }) {
  const router = useRouter();
  const [current, setCurrent] = useState(connection);
  const [polling, setPolling] = useState(connection.state !== "open");
  const inFlightRef = useRef(false);
  const stoppedRef = useRef(connection.state === "open");

  useEffect(() => {
    if (connection.state === "open") return;
    let disposed = false;
    let timer: number | undefined;
    let attempts = 0;

    const poll = async () => {
      if (disposed || stoppedRef.current || inFlightRef.current) return;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        setPolling(false);
        setCurrent((previous) => ({ ...previous, error: "No pudimos confirmar el cambio automáticamente. Actualiza el estado para reintentar." }));
        return;
      }

      inFlightRef.current = true;
      attempts += 1;
      try {
        const result = await getWhatsappConnectionStatusAction();
        if (disposed) return;
        if (result.state === "open") {
          stoppedRef.current = true;
          setPolling(false);
          setCurrent({ qr: null, state: "open", error: null });
          router.refresh();
          return;
        }
        setCurrent((previous) => ({ ...previous, state: result.state, error: result.error ?? previous.error }));
      } catch {
        if (!disposed) setCurrent((previous) => ({ ...previous, error: "No pudimos consultar el estado. Puedes reintentar sin recargar toda la pantalla." }));
      } finally {
        inFlightRef.current = false;
      }

      if (!disposed && !stoppedRef.current && attempts < MAX_POLL_ATTEMPTS) {
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } else if (!disposed && !stoppedRef.current) {
        setPolling(false);
      }
    };

    timer = window.setTimeout(() => void poll(), 1000);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [connection.state, router]);

  const status = stateCopy(current.state);
  const isConnected = current.state === "open";

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
      <div><p className="font-black">{status.title}</p><p className="mt-1 text-sm font-semibold opacity-80">{current.error || status.description}</p>{polling ? <p className="mt-2 text-xs font-black" aria-live="polite">Comprobando conexión…</p> : null}</div>
    </div>

    {current.qr && !isConnected ? (
      <div className="mt-7 flex flex-col items-center">
        <div className="rounded-[24px] bg-white p-3 shadow-[0_10px_30px_rgba(16,24,40,0.1)] ring-1 ring-black/[0.06]"><Image src={current.qr} alt="Código QR para conectar WhatsApp" width={320} height={320} unoptimized className="size-64 sm:size-80" /></div>
        <p className="mt-5 text-center text-sm font-bold text-[var(--muted)]">Este código caduca. Si no escanea, genera otro QR y vuelve a intentarlo de inmediato.</p>
      </div>
    ) : null}

    <div className="mt-7 flex flex-wrap items-center gap-2">
      {!isConnected ? <RefreshQrButton label="Generar QR nuevo" /> : null}
      {isConnected ? <UnlinkWhatsappButton /> : null}
    </div>
  </section>;
}
