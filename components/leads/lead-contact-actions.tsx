"use client";

import { Clipboard, Download, MessageCircle, Share2, UserRound } from "lucide-react";
import { useState } from "react";

import { copyVCard, downloadVCard, shareVCard } from "@/lib/contacts/browser-actions";
import type { VCardContact } from "@/lib/contacts/vcard";
import { buildWhatsAppUrl } from "@/lib/whatsapp/links";

export function LeadContactActions({ contact }: { contact: VCardContact }) {
  const [busy, setBusy] = useState<"share" | "copy" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function shareContact() {
    setBusy("share");
    setFeedback("Compartiendo…");
    try {
      const result = await shareVCard(contact);
      setFeedback(result === "shared" ? "Contacto compartido." : result === "copied" ? "Contacto copiado para compartir." : "Archivo de contacto descargado.");
    } catch {
      setFeedback("No se pudo compartir el contacto.");
    } finally {
      setBusy(null);
    }
  }

  async function copyContact() {
    setBusy("copy");
    setFeedback("Copiando…");
    try {
      await copyVCard(contact);
      setFeedback("Contacto copiado.");
    } catch {
      setFeedback("No se pudo copiar el contacto.");
    } finally {
      setBusy(null);
    }
  }

  function saveContact() {
    try {
      downloadVCard(contact);
      setFeedback("Archivo de contacto descargado. Ábrelo para guardarlo en Contactos.");
    } catch {
      setFeedback("No se pudo preparar el archivo de contacto.");
    }
  }

  return <section className="mt-3 rounded-2xl border border-[#dce5ef] bg-[#f8fbff] p-3" aria-label="Contacto del cliente">
    <div className="flex items-start gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-[#3c5f9b]"><UserRound size={15} /></span><div><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">Contacto del cliente</p><p className="mt-1 text-xs font-semibold text-[var(--muted)]">Genera un archivo con su nombre y teléfono para guardarlo en tu celular.</p></div></div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={saveContact} disabled={busy !== null} className="button-primary min-h-9 px-3 py-2 text-[11px] disabled:opacity-50"><Download size={14} />Guardar contacto</button>
      <button type="button" onClick={() => void shareContact()} disabled={busy !== null} className="button-secondary min-h-9 px-3 py-2 text-[11px] disabled:opacity-50"><Share2 size={14} />{busy === "share" ? "Compartiendo…" : "Compartir contacto"}</button>
      <button type="button" onClick={() => void copyContact()} disabled={busy !== null} className="button-secondary min-h-9 px-3 py-2 text-[11px] disabled:opacity-50"><Clipboard size={14} />{busy === "copy" ? "Copiando…" : "Copiar contacto"}</button>
      <a href={buildWhatsAppUrl(contact.phone)} target="_blank" rel="noreferrer" onClick={() => setFeedback("Abriendo WhatsApp…")} className="button-secondary min-h-9 px-3 py-2 text-[11px]"><MessageCircle size={14} />Abrir WhatsApp</a>
    </div>
    {feedback ? <p className="mt-2 text-[11px] font-bold text-[var(--muted)]" aria-live="polite">{feedback}</p> : null}
  </section>;
}
