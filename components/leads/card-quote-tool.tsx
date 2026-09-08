"use client";

import { Calculator } from "lucide-react";
import { useRouter } from "next/navigation";

import type { Lead } from "@/lib/domain/lead";

type CardQuoteLead = Pick<Lead, "id">;

export function CardQuoteTool({ lead }: { lead: CardQuoteLead }) {
  const router = useRouter();

  return (
    <div className="mt-2 flex justify-end">
      <button type="button" onClick={() => router.push(`/cotizacion?leadId=${encodeURIComponent(lead.id)}`)} className="button-secondary min-h-9 shrink-0 px-3 py-1.5 text-[11px]"><Calculator size={14} />Cotizar</button>
    </div>
  );
}
