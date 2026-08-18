"use client";

import { Download, LoaderCircle, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { downloadVCard, isWebShareAvailable, shareVCard } from "@/lib/contacts/browser-actions";
import type { VCardContact } from "@/lib/contacts/vcard";
import { buildWhatsAppUrl } from "@/lib/whatsapp/links";

export function LeadContactActions({ contact, compact = false, showWhatsApp = true, showShare = true }: { contact: VCardContact; compact?: boolean; showWhatsApp?: boolean; showShare?: boolean }) {
  const [busy, setBusy] = useState<"save" | "share" | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShareAvailable(isWebShareAvailable()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function shareContact() {
    setBusy("share");
    setFeedback("Compartiendo…");
    try {
      const result = await shareVCard(contact);
      setFeedback(result === "shared" ? "Contacto compartido." : "No se pudo compartir el contacto.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setFeedback("Compartir cancelado.");
      else setFeedback("No se pudo compartir el contacto.");
    } finally {
      setBusy(null);
    }
  }

  function saveContact() {
    setBusy("save");
    setFeedback(null);
    try {
      downloadVCard(contact);
    } catch {
      setFeedback("No se pudo preparar el contacto.");
    }
    setBusy(null);
  }

  return <div className={`${compact ? "mt-0" : "mt-3 border-t border-black/[0.06] pt-3"} flex max-w-full flex-wrap items-center gap-1.5`} aria-label="Acciones del contacto del cliente" onClick={(event) => event.stopPropagation()}>
    <button type="button" aria-label="Guardar contacto" title="Guardar contacto" onClick={saveContact} disabled={busy !== null} aria-busy={busy === "save"} className={compact ? "icon-action lead-contact-save" : "button-primary min-h-10 px-3 py-2 text-[11px] disabled:opacity-50"}>{busy === "save" ? <LoaderCircle size={compact ? 20 : 18} className="animate-spin" /> : <Download size={compact ? 20 : 14} />}{compact ? null : busy === "save" ? "Abriendo…" : "Guardar contacto"}</button>
    {showShare && shareAvailable ? <button type="button" onClick={() => void shareContact()} disabled={busy !== null} className="button-secondary min-h-10 px-3 py-2 text-[11px] disabled:opacity-50"><Share2 size={14} />{busy === "share" ? "Compartiendo…" : "Compartir"}</button> : null}
    {showWhatsApp ? <a href={buildWhatsAppUrl(contact.phone)} target="_blank" rel="noreferrer" onClick={() => setFeedback("Abriendo WhatsApp…")} className="button-secondary min-h-10 px-3 py-2 text-[11px]"><MessageCircle size={14} />WhatsApp</a> : null}
    {feedback ? <p className="basis-full text-[11px] font-bold text-[var(--muted)]" aria-live="polite">{feedback}</p> : null}
  </div>;
}
