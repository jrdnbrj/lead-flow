"use client";

import { CarFront, ExternalLink, FileText, Image as ImageIcon, Palette, X } from "lucide-react";
import Image, { type ImageLoaderProps } from "next/image";
import { useEffect, useState } from "react";

import type { CatalogModel } from "@/lib/catalog/repository";

const directImageLoader = ({ src }: ImageLoaderProps) => src;

export function CarCatalog({ models }: { models: CatalogModel[] }) {
  const [photoModel, setPhotoModel] = useState<CatalogModel | null>(null);
  const [sheetModel, setSheetModel] = useState<CatalogModel | null>(null);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!photoModel && !sheetModel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPhotoModel(null); setSheetModel(null); }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [photoModel, sheetModel]);

  if (models.length === 0) return <div className="rounded-[26px] border border-black/[0.06] bg-white p-6 text-sm font-semibold text-[var(--muted)]">No hay vehículos disponibles en el catálogo.</div>;

  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {models.map((model) => {
        const hasPhoto = Boolean(model.imageUrl) && !failedPhotoIds.has(model.id);
        return <article key={model.id} className="overflow-hidden rounded-[26px] border border-black/[0.06] bg-white shadow-[0_12px_40px_rgba(16,24,40,0.06)]">
        <button type="button" disabled={!hasPhoto} onClick={() => setPhotoModel(model)} aria-label={hasPhoto ? `Ver foto grande de ${model.name}` : `Foto no disponible de ${model.name}`} className="group relative block aspect-[4/3] w-full overflow-hidden bg-[#f5f1e9] text-left disabled:cursor-default">
          {hasPhoto ? <Image loader={directImageLoader} unoptimized src={model.imageUrl!} alt={model.imageAlt} fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" onError={() => { setFailedPhotoIds((current) => new Set(current).add(model.id)); setPhotoModel((current) => current?.id === model.id ? null : current); }} className="object-contain p-5 transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex size-full flex-col items-center justify-center gap-2 px-5 text-center text-xs font-bold text-[var(--muted)]"><ImageIcon size={24} />Foto no disponible</div>}
          {hasPhoto ? <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-[var(--ink)] shadow-sm">Ver foto</span> : null}
        </button>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Modelo {String(model.sortOrder).padStart(2, "0")}</p><h2 className="mt-1 text-xl font-black tracking-[-0.04em]">{model.name}</h2></div><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f6f3ed] text-[var(--muted)]"><CarFront size={18} /></span></div>
          <div className="mt-4"><div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]"><Palette size={13} />Colores disponibles</div>{model.colors.length ? <div className="mt-2 flex flex-wrap gap-1.5">{model.colors.map((color) => <span key={color.id} className="rounded-full border border-black/[0.08] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)]">{color.name}</span>)}</div> : <p className="mt-2 text-xs font-semibold text-[var(--muted)]">Colores por confirmar</p>}</div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" disabled={!hasPhoto} onClick={() => setPhotoModel(model)} className="button-secondary min-h-10 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"><ImageIcon size={15} />Foto</button><button type="button" disabled={!model.technicalSheetUrl} onClick={() => setSheetModel(model)} className="button-primary min-h-10 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"><FileText size={15} />{model.technicalSheetUrl ? "Ficha técnica" : "Ficha no disponible"}</button></div>
        </div>
      </article>;
      })}
    </div>
    {photoModel?.imageUrl && !failedPhotoIds.has(photoModel.id) ? <div role="presentation" onClick={() => setPhotoModel(null)} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="catalog-photo-title" onClick={(event) => event.stopPropagation()} className="relative max-h-[92vh] w-full max-w-3xl rounded-[26px] bg-white p-4 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-6"><button type="button" onClick={() => setPhotoModel(null)} aria-label="Cerrar foto" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]"><X size={18} /></button><p id="catalog-photo-title" className="eyebrow px-1">{photoModel.name}</p><div className="relative mt-4 flex max-h-[76vh] items-center justify-center overflow-hidden rounded-2xl bg-[#f5f1e9] p-4 sm:p-8"><Image loader={directImageLoader} unoptimized src={photoModel.imageUrl} alt={photoModel.imageAlt} width={1200} height={900} onError={() => { setFailedPhotoIds((current) => new Set(current).add(photoModel.id)); setPhotoModel(null); }} className="max-h-[68vh] w-full object-contain" /></div></div></div> : null}
    {sheetModel?.technicalSheetUrl ? <div role="presentation" onClick={() => setSheetModel(null)} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="catalog-sheet-title" onClick={(event) => event.stopPropagation()} className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-[26px] bg-white p-3 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-5"><div className="flex items-center justify-between gap-3 px-1"><p id="catalog-sheet-title" className="eyebrow">Ficha técnica · {sheetModel.name}</p><button type="button" onClick={() => setSheetModel(null)} aria-label="Cerrar ficha técnica" className="grid size-9 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]"><X size={18} /></button></div><iframe title={`Ficha técnica de ${sheetModel.name}`} src={`${sheetModel.technicalSheetUrl}#view=FitH`} className="mt-3 min-h-0 flex-1 w-full rounded-xl border border-black/[0.08] bg-[#f6f3ed]" /><a href={sheetModel.technicalSheetUrl} target="_blank" rel="noreferrer" className="button-secondary mt-3 min-h-10 w-full px-3 py-2 text-xs sm:w-auto sm:self-end"><ExternalLink size={15} />Abrir ficha completa</a></div></div> : null}
  </>;
}
