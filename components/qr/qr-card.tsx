"use client";

import { Download, Maximize2, Share2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import type { SellerProfile } from "@/lib/domain/lead";
import { downloadVCard, isWebShareAvailable, shareVCard } from "@/lib/contacts/browser-actions";
import { buildVCard } from "@/lib/contacts/vcard";

export function QrCard({ seller, leadName }: { seller: SellerProfile; leadName?: string }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"save" | "share" | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vCardContact = useMemo(() => ({ name: seller.name, phone: seller.phone, organization: seller.company, email: seller.email }), [seller]);
  const vCard = useMemo(() => buildVCard(vCardContact), [vCardContact]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShareAvailable(isWebShareAvailable()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function saveContact() {
    setBusyAction("save");
    setFeedback(null);
    try {
      downloadVCard(vCardContact);
    } catch {
      setFeedback("No se pudo preparar el contacto.");
    } finally {
      setBusyAction(null);
    }
  }

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "contacto-leadflow.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    setFeedback("QR descargado.");
  }

  async function shareContact() {
    setBusyAction("share");
    setFeedback("Compartiendo…");
    try {
      const result = await shareVCard(vCardContact);
      setFeedback(result === "shared" ? "Contacto compartido." : "No se pudo compartir el contacto.");
    } catch (error) {
      setFeedback(error instanceof DOMException && error.name === "AbortError" ? "Compartir cancelado." : "No se pudo compartir el contacto.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="grid items-center gap-8 rounded-[32px] border border-black/[0.06] bg-white p-5 shadow-[0_18px_60px_rgba(16,24,40,0.08)] sm:grid-cols-[0.8fr_1.2fr] sm:p-8">
      <div className="rounded-[28px] bg-[#f5f1e9] p-5 sm:p-7">
        <div className="mx-auto flex max-w-[290px] flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--lime)]"><UserRound size={25} /></div>
          <h2 className="text-2xl font-black tracking-[-0.05em]">{seller.name}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{seller.company}</p>
          <button type="button" onClick={() => setIsQrPreviewOpen(true)} aria-label="Abrir vista previa grande del código QR" className="group mt-6 rounded-[26px] bg-white p-4 text-left shadow-[0_8px_20px_rgba(16,24,40,0.08)] ring-1 ring-transparent transition hover:ring-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ink)]">
            <QRCodeCanvas ref={canvasRef} value={vCard} size={230} bgColor="#ffffff" fgColor="#101828" level="M" includeMargin />
            <span className="mt-2 flex items-center justify-center gap-1 text-[10px] font-black text-[var(--muted)] opacity-0 transition group-hover:opacity-100"><Maximize2 size={12} />Ver más grande</span>
          </button>
          <p className="mt-4 text-xs font-semibold text-[var(--muted)]">Toca el QR para verlo más grande</p>
        </div>
      </div>
      <div className="sm:pr-4">
        <span className="eyebrow">Tu contacto, a un escaneo</span>
        <h1 className="mt-3 max-w-lg text-3xl font-black leading-[0.98] tracking-[-0.06em] sm:text-5xl">Que tu cliente pueda encontrarte cuando lo necesite.</h1>
        <p className="mt-5 max-w-md text-base leading-7 text-[var(--muted)]">{leadName ? <><strong className="text-[var(--ink)]">{leadName}</strong>, guarda los datos de tu asesor</> : "Comparte este código para que tu cliente guarde los datos de su asesor"} y pueda escribirte fácilmente cuando quiera retomar la conversación.</p>
        <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
          <button type="button" disabled={busyAction !== null} onClick={saveContact} className="action-button bg-[var(--ink)] text-white hover:bg-[#24334e] disabled:opacity-60"><Download size={17} />{busyAction === "save" ? "Abriendo…" : "Guardar contacto"}</button>
          {shareAvailable ? <button type="button" disabled={busyAction !== null} onClick={() => void shareContact()} className="action-button border border-black/[0.1] bg-white text-[var(--ink)] hover:bg-[#faf8f3] disabled:opacity-60"><Share2 size={17} />{busyAction === "share" ? "Compartiendo…" : "Compartir contacto"}</button> : null}
          <button type="button" onClick={downloadQr} className="action-button border border-black/[0.1] bg-white text-[var(--ink)] hover:bg-[#faf8f3]"><Download size={17} />Descargar QR</button>
        </div>
        {feedback ? <p className="mt-3 text-xs font-bold text-[var(--muted)]" aria-live="polite">{feedback}</p> : null}
        <p className="mt-5 text-xs font-medium text-[var(--muted)]">vCard 3.0 · {seller.phone} · {seller.email}</p>
    </div>
    {isQrPreviewOpen ? <div role="presentation" onClick={() => setIsQrPreviewOpen(false)} className="fixed inset-0 z-[60] grid place-items-center bg-[#101828]/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="qr-preview-title" onClick={(event) => event.stopPropagation()} className="relative flex max-h-[92vh] w-full max-w-lg flex-col items-center overflow-auto rounded-[30px] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-8"><button type="button" onClick={() => setIsQrPreviewOpen(false)} aria-label="Cerrar vista previa del QR" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)] hover:bg-[#e9e4da]"><X size={18} /></button><p id="qr-preview-title" className="eyebrow">Vista previa del código QR</p><div className="mt-5 rounded-[26px] bg-[#f5f1e9] p-4 sm:p-6"><QRCodeCanvas value={vCard} size={420} bgColor="#ffffff" fgColor="#101828" level="M" includeMargin className="h-auto max-w-full" /></div><p className="mt-4 text-center text-sm font-semibold text-[var(--muted)]">Escanea este código para guardar los datos de {seller.name}.</p><button type="button" onClick={() => setIsQrPreviewOpen(false)} className="button-secondary mt-5">Cerrar</button></div></div> : null}
  </div>
  );
}
