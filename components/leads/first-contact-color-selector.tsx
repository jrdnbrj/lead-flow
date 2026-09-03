"use client";

import Image from "next/image";
import { Check, LoaderCircle, Palette, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Lead } from "@/lib/domain/lead";
import { getFirstContactColorOptionsAction } from "@/lib/leads/actions";
import type { FirstContactColorModelOption, FirstContactColorSelection } from "@/lib/first-contact/resource-plan";

const directImageLoader = ({ src }: { src: string }) => src;

type ColorSelectorLead = Pick<Lead, "id" | "fullName" | "carModels">;

export function FirstContactColorSelector({ lead, open, onCancel, onConfirm }: { lead: ColorSelectorLead; open: boolean; onCancel: () => void; onConfirm: (selections: FirstContactColorSelection[]) => void }) {
  const [models, setModels] = useState<FirstContactColorModelOption[]>([]);
  const [selected, setSelected] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getFirstContactColorOptionsAction(lead.id).then((response) => {
      if (cancelled) return;
      if (response.success && response.data) setModels(response.data);
      else setError(response.error || "No pudimos cargar los colores.");
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError("No pudimos cargar los colores. Puedes intentarlo de nuevo.");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [lead.id, open]);

  const selections = useMemo(() => Object.entries(selected).flatMap(([vehicleIndex, colorId]) => colorId ? [{ vehicleIndex: Number(vehicleIndex), colorId }] : []), [selected]);

  if (!open) return null;

  return <div role="presentation" onClick={onCancel} className="fixed inset-0 z-[80] grid place-items-center bg-[#101828]/55 p-3 backdrop-blur-sm sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="first-contact-colors-title" onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[24px] border border-black/[0.08] bg-white p-4 shadow-[0_24px_80px_rgba(16,24,40,0.24)] sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Primer contacto</p><h2 id="first-contact-colors-title" className="mt-1 text-lg font-black">Elige la foto de cada vehículo</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Es opcional. Si no eliges un color, se enviará la foto predeterminada.</p></div><button type="button" onClick={onCancel} aria-label="Cerrar selección de colores" className="icon-action shrink-0"><X size={18} /></button></div>
    {loading ? <div className="flex min-h-32 items-center justify-center gap-2 text-sm font-bold text-[var(--muted)]"><LoaderCircle size={18} className="animate-spin" />Cargando opciones…</div> : error ? <div className="mt-4 rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]" role="alert">{error}</div> : <div className="mt-4 space-y-3">{models.map((model) => <ColorModelCard key={model.vehicleIndex} model={model} value={selected[model.vehicleIndex] ?? null} onChange={(colorId) => setSelected((current) => ({ ...current, [model.vehicleIndex]: colorId }))} />)}</div>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="button-secondary min-h-9 px-3 py-2 text-[11px]">Cancelar</button><button type="button" disabled={loading || Boolean(error)} onClick={() => onConfirm(selections)} className="button-primary min-h-9 px-3 py-2 text-[11px]">Continuar</button></div>
  </div></div>;
}

function ColorModelCard({ model, value, onChange }: { model: FirstContactColorModelOption; value: string | null; onChange: (colorId: string | null) => void }) {
  const selectedColor = model.colors.find((color) => color.id === value);
  const previewUrl = selectedColor?.imageUrl ?? model.defaultImageUrl;
  return <section className="rounded-xl border border-black/[0.07] bg-[#fbfaf7] p-2.5">
    <div className="flex items-center gap-2.5">
      <div aria-label="Vista previa de miniatura" className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-[#f0eee8]">
        {previewUrl ? <Image loader={directImageLoader} unoptimized src={previewUrl} alt={`${model.modelName}${selectedColor ? ` en ${selectedColor.name}` : ""}`} fill sizes="96px" className="object-cover" /> : <div className="grid size-full place-items-center text-[var(--muted)]"><Palette size={18} /></div>}
      </div>
      <div className="min-w-0"><p className="truncate text-sm font-black">{model.modelName}</p><p className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">{selectedColor ? selectedColor.imageUrl ? `Foto: ${selectedColor.name}` : `${selectedColor.name} · usa la foto predeterminada` : "Foto predeterminada"}</p></div>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      <ColorChoice label="Predeterminada" selected={!value} onClick={() => onChange(null)} />
      {model.colors.map((color) => <ColorChoice key={color.id} label={color.name} selected={value === color.id} onClick={() => onChange(color.id)} />)}
    </div>
  </section>;
}

function ColorChoice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition ${selected ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-white text-[var(--ink)] hover:border-black/25"}`}>{selected ? <Check size={12} strokeWidth={3} /> : null}{label}</button>;
}
