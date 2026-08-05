"use client";

import { Download, ExternalLink, Maximize2, MessageCircle, Share2, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import type { SellerProfile } from "@/lib/domain/lead";

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function QrCard({ seller, leadName }: { seller: SellerProfile; leadName?: string }) {
  const [copied, setCopied] = useState(false);
  const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vCard = useMemo(() => [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(seller.name)}`,
    `ORG:${escapeVCard(seller.company)}`,
    `TEL;TYPE=CELL:${seller.phone}`,
    `EMAIL:${seller.email}`,
    "END:VCARD",
  ].join("\n"), [seller]);

  async function copyVCard() {
    await navigator.clipboard.writeText(vCard);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "contacto-leadflow.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function shareContact() {
    if (!navigator.share) {
      await copyVCard();
      return;
    }
    await navigator.share({ title: `Contacto de ${seller.name}`, text: vCard });
  }

  function openWhatsApp() {
    const fallbackTimer = window.setTimeout(() => {
      if (document.visibilityState === "visible") window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
    }, 900);
    window.setTimeout(() => window.clearTimeout(fallbackTimer), 2500);
    window.location.href = "whatsapp://";
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
          <button type="button" onClick={shareContact} className="action-button bg-[var(--ink)] text-white hover:bg-[#24334e]"><Share2 size={17} />Compartir contacto</button>
          <button type="button" onClick={copyVCard} className="action-button border border-black/[0.1] bg-white text-[var(--ink)] hover:bg-[#faf8f3]"><MessageCircle size={17} />{copied ? "¡Copiado!" : "Copiar vCard"}</button>
          <button type="button" onClick={downloadQr} className="action-button border border-black/[0.1] bg-white text-[var(--ink)] hover:bg-[#faf8f3]"><Download size={17} />Descargar QR</button>
          <button type="button" onClick={openWhatsApp} className="action-button border border-black/[0.1] bg-[#e4f8e9] text-[#18733a] hover:bg-[#d4f1dc]"><ExternalLink size={17} />Abrir WhatsApp</button>
        </div>
        <p className="mt-5 text-xs font-medium text-[var(--muted)]">vCard 3.0 · {seller.phone} · {seller.email}</p>
    </div>
    {isQrPreviewOpen ? <div role="presentation" onClick={() => setIsQrPreviewOpen(false)} className="fixed inset-0 z-[60] grid place-items-center bg-[#101828]/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="qr-preview-title" onClick={(event) => event.stopPropagation()} className="relative flex max-h-[92vh] w-full max-w-lg flex-col items-center overflow-auto rounded-[30px] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-8"><button type="button" onClick={() => setIsQrPreviewOpen(false)} aria-label="Cerrar vista previa del QR" className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)] hover:bg-[#e9e4da]"><X size={18} /></button><p id="qr-preview-title" className="eyebrow">Vista previa del código QR</p><div className="mt-5 rounded-[26px] bg-[#f5f1e9] p-4 sm:p-6"><QRCodeCanvas value={vCard} size={420} bgColor="#ffffff" fgColor="#101828" level="M" includeMargin className="h-auto max-w-full" /></div><p className="mt-4 text-center text-sm font-semibold text-[var(--muted)]">Escanea este código para guardar los datos de {seller.name}.</p><button type="button" onClick={() => setIsQrPreviewOpen(false)} className="button-secondary mt-5">Cerrar</button></div></div> : null}
  </div>
  );
}
