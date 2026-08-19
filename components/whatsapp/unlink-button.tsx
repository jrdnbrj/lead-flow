"use client";

import { Link2Off, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { unlinkWhatsappInstanceAction } from "@/lib/whatsapp/actions";

export function UnlinkWhatsappButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    if (!window.confirm("¿Desvincular esta cuenta de WhatsApp? Después podrás escanear otro QR.")) return;
    setIsLoading(true);
    setError(null);
    const response = await unlinkWhatsappInstanceAction();
    if (response.success) {
      window.location.assign(`/whatsapp?refresh=${Date.now()}`);
    } else {
      setError(response.message || response.error || "No pudimos desvincular WhatsApp.");
      setIsLoading(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={unlink} disabled={isLoading} aria-busy={isLoading} className="button-secondary border-red-200 text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-70"><span className="grid size-4 place-items-center">{isLoading ? <LoaderCircle size={16} className="animate-spin" /> : <Link2Off size={16} />}</span>{isLoading ? "Desvinculando…" : "Desvincular cuenta"}</button>{error ? <p className="text-xs font-bold text-red-600" role="alert">{error}</p> : null}</div>;
}
