"use client";

import { RefreshCw } from "lucide-react";

export function RefreshQrButton({ label = "Generar QR nuevo" }: { label?: string }) {
  function refreshQr() {
    window.location.assign(`/whatsapp?refresh=${Date.now()}`);
  }

  return <button type="button" onClick={refreshQr} className="button-primary"><RefreshCw size={17} />{label}</button>;
}
