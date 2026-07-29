"use client";

import { Download, ExternalLink, MessageCircle, Share2, UserRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";

import type { SellerProfile } from "@/lib/domain/lead";

function escapeVCard(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function QrCard({ seller, leadName }: { seller: SellerProfile; leadName?: string }) {
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="grid items-center gap-8 rounded-[32px] border border-black/[0.06] bg-white p-5 shadow-[0_18px_60px_rgba(16,24,40,0.08)] sm:grid-cols-[0.8fr_1.2fr] sm:p-8">
      <div className="rounded-[28px] bg-[#f5f1e9] p-5 sm:p-7">
        <div className="mx-auto flex max-w-[290px] flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--lime)]"><UserRound size={25} /></div>
          <h2 className="text-2xl font-black tracking-[-0.05em]">{seller.name}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{seller.company}</p>
          <div className="mt-6 rounded-[26px] bg-white p-4 shadow-[0_8px_20px_rgba(16,24,40,0.08)]">
            <QRCodeCanvas ref={canvasRef} value={vCard} size={230} bgColor="#ffffff" fgColor="#101828" level="M" includeMargin />
          </div>
          <p className="mt-4 text-xs font-semibold text-[var(--muted)]">Escanéame para guardar el contacto</p>
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
          <a href="https://web.whatsapp.com/" target="_blank" rel="noreferrer" className="action-button border border-black/[0.1] bg-[#e4f8e9] text-[#18733a] hover:bg-[#d4f1dc]"><ExternalLink size={17} />Abrir WhatsApp</a>
        </div>
        <p className="mt-5 text-xs font-medium text-[var(--muted)]">vCard 3.0 · {seller.phone} · {seller.email}</p>
      </div>
    </div>
  );
}
