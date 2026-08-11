"use client";

import { Link2Off } from "lucide-react";
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

  return <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={unlink} disabled={isLoading} className="button-secondary border-red-200 text-red-700 hover:bg-red-50"><Link2Off size={16} />{isLoading ? "Desvinculando" : "Desvincular cuenta"}</button>{error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}</div>;
}
