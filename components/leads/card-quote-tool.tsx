"use client";

import { Calculator } from "lucide-react";
import { useRouter } from "next/navigation";

import type { Lead } from "@/lib/domain/lead";

type CardQuoteLead = Pick<Lead, "id">;

export function CardQuoteTool({ lead, compact = false, inline = false }: { lead: CardQuoteLead; compact?: boolean; inline?: boolean }) {
  const router = useRouter();
  const button = <button type="button" onClick={(event) => { event.stopPropagation(); router.push(`/cotizacion?leadId=${encodeURIComponent(lead.id)}`); }} aria-label="Cotizar" title="Cotizar" className={compact ? "icon-action" : "button-secondary min-h-9 shrink-0 px-3 py-1.5 text-[11px]"}><Calculator size={compact ? 20 : 14} />{compact ? null : "Cotizar"}</button>;

  if (compact || inline) return button;
  return <div className="mt-2 flex justify-end">{button}</div>;
}
