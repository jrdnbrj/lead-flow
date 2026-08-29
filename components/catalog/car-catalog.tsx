"use client";

import { ArrowLeft, ArrowRight, CarFront, ExternalLink, FileText, Image as ImageIcon, X } from "lucide-react";
import Image, { type ImageLoaderProps } from "next/image";
import { useEffect, useMemo, useState, type TouchEvent } from "react";

import type { CatalogModel } from "@/lib/catalog/repository";

const directImageLoader = ({ src }: ImageLoaderProps) => src;

type CatalogPhotoSlide = {
  id: string;
  label: string;
  imageUrl: string | null;
  imageAlt: string;
  colorSlug?: string;
};

const colorSwatchClasses: Record<string, string> = {
  blanco: "bg-white",
  negro: "bg-[#111827]",
  plateado: "bg-[#c7ccd1]",
  plata: "bg-[#b8bec5]",
  "plateado-mate": "bg-[#aeb4b8]",
  "plata-mate": "bg-[#aeb4b8]",
  "plata-silver": "bg-[#a7afb8]",
  gris: "bg-[#6b7280]",
  "gris-plateado": "bg-[#818991]",
  rojo: "bg-[#c93636]",
  azul: "bg-[#3c72b8]",
  celeste: "bg-[#7fc6df]",
  verde: "bg-[#5e9b69]",
  naranja: "bg-[#e48635]",
  "plateado-champagne": "bg-[#d6c2a4]",
};

function photoSlidesFor(model: CatalogModel): CatalogPhotoSlide[] {
  return model.colors.map((color) => ({
      id: color.id,
      label: color.name,
      imageUrl: color.imageUrl ?? null,
      imageAlt: `${model.name} en color ${color.name}`,
      colorSlug: color.slug,
    }));
}

export function CarCatalog({ models }: { models: CatalogModel[] }) {
  const [photoModel, setPhotoModel] = useState<CatalogModel | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [sheetModel, setSheetModel] = useState<CatalogModel | null>(null);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const photoSlides = useMemo(() => photoModel ? photoSlidesFor(photoModel) : [], [photoModel]);
  const activePhoto = photoSlides[photoIndex] ?? photoSlides[0] ?? null;

  const openPhotoViewer = (model: CatalogModel) => {
    setPhotoModel(model);
    setPhotoIndex(0);
  };

  const closePhotoViewer = () => {
    setPhotoModel(null);
    setPhotoIndex(0);
    setTouchStartX(null);
  };

  const movePhoto = (direction: 1 | -1) => {
    if (photoSlides.length < 2) return;
    setPhotoIndex((current) => (current + direction + photoSlides.length) % photoSlides.length);
  };

  const onPhotoTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0]?.clientX - touchStartX;
    if (Math.abs(distance) >= 40) movePhoto(distance < 0 ? 1 : -1);
    setTouchStartX(null);
  };

  useEffect(() => {
    if (!photoModel && !sheetModel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPhotoModel(null); setPhotoIndex(0); setTouchStartX(null); setSheetModel(null); }
      if (photoModel && photoSlides.length > 1 && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setPhotoIndex((current) => (current + direction + photoSlides.length) % photoSlides.length);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [photoModel, sheetModel, photoSlides.length]);

  if (models.length === 0) return <div className="rounded-[26px] border border-black/[0.06] bg-white p-6 text-sm font-semibold text-[var(--muted)]">No hay vehículos disponibles en el catálogo.</div>;

  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {models.map((model) => {
        const firstPhoto = model.colors.find((color) => color.imageUrl);
        const hasPhoto = Boolean(firstPhoto && !failedPhotoIds.has(firstPhoto.id));
        return <article key={model.id} className="overflow-hidden rounded-[26px] border border-black/[0.06] bg-white shadow-[0_12px_40px_rgba(16,24,40,0.06)]">
        <button type="button" disabled={!hasPhoto} onClick={() => openPhotoViewer(model)} aria-label={hasPhoto ? `Ver fotos de ${model.name}` : `Foto no disponible de ${model.name}`} className="group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden bg-[#f5f1e9] text-left disabled:cursor-default">
          {hasPhoto ? <Image loader={directImageLoader} unoptimized src={firstPhoto!.imageUrl!} alt={`${model.name} en color ${firstPhoto!.name}`} fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" onError={() => { setFailedPhotoIds((current) => new Set(current).add(firstPhoto!.id)); }} className="object-contain p-5 transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex size-full flex-col items-center justify-center gap-2 px-5 text-center text-xs font-bold text-[var(--muted)]"><ImageIcon size={24} />Foto no disponible</div>}
        </button>
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow">Modelo {String(model.sortOrder).padStart(2, "0")}</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-xl font-black tracking-[-0.04em]">{model.name}</h2>{model.technicalSheetUrl ? <button type="button" onClick={() => setSheetModel(model)} aria-label={`Ver ficha técnica de ${model.name}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-[#f6f3ed] px-2.5 py-1 text-[10px] font-black text-[var(--ink)] shadow-sm transition hover:border-[var(--ink)] hover:bg-white"><FileText size={12} />Ficha técnica<ExternalLink size={11} /></button> : <span className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-[#f6f3ed] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)]"><FileText size={12} />Ficha no disponible</span>}</div></div><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#f6f3ed] text-[var(--muted)]"><CarFront size={18} /></span></div>
          <div className="mt-4">{model.colors.length ? <div className="flex flex-wrap gap-1.5">{model.colors.map((color) => <span key={color.id} className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-bold text-[var(--ink)]"><span aria-hidden="true" className={`size-2 rounded-full border border-black/10 ${colorSwatchClasses[color.slug] ?? "bg-[#d9d4ca]"}`} />{color.name}</span>)}</div> : <p className="text-xs font-semibold text-[var(--muted)]">Colores por confirmar</p>}</div>
        </div>
      </article>;
      })}
    </div>
    {photoModel && activePhoto ? <div role="presentation" onClick={closePhotoViewer} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="catalog-photo-title" onClick={(event) => event.stopPropagation()} className="relative max-h-[92vh] w-full max-w-3xl rounded-[26px] bg-white p-4 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-6"><button type="button" onClick={closePhotoViewer} aria-label="Cerrar foto" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]"><X size={18} /></button><div className="flex items-start justify-between gap-3 pr-10"><div><p id="catalog-photo-title" className="eyebrow">{photoModel.name}</p><p className="mt-1 text-sm font-black text-[var(--ink)]">{activePhoto.label}</p></div><span className="shrink-0 rounded-full bg-[#f6f3ed] px-2.5 py-1 text-[10px] font-black text-[var(--muted)]">{photoIndex + 1} / {photoSlides.length}</span></div><div className="relative mt-4 flex max-h-[65vh] min-h-[240px] items-center justify-center overflow-hidden rounded-2xl bg-[#f5f1e9] p-4 sm:p-8" onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)} onTouchEnd={onPhotoTouchEnd}>{activePhoto.imageUrl && !failedPhotoIds.has(activePhoto.id) ? <Image loader={directImageLoader} unoptimized src={activePhoto.imageUrl} alt={activePhoto.imageAlt} width={1200} height={900} onError={() => { setFailedPhotoIds((current) => new Set(current).add(activePhoto.id)); }} className="max-h-[60vh] w-full object-contain" /> : <div className="flex flex-col items-center justify-center gap-2 px-6 text-center text-sm font-bold text-[var(--muted)]"><ImageIcon size={28} /><span>Foto de {activePhoto.label} no disponible todavía</span></div>}{photoSlides.length > 1 ? <><button type="button" onClick={() => movePhoto(-1)} aria-label="Foto anterior" className="absolute left-2 grid size-9 place-items-center rounded-full bg-white/90 text-[var(--ink)] shadow-sm"><ArrowLeft size={17} /></button><button type="button" onClick={() => movePhoto(1)} aria-label="Foto siguiente" className="absolute right-2 grid size-9 place-items-center rounded-full bg-white/90 text-[var(--ink)] shadow-sm"><ArrowRight size={17} /></button></> : null}</div><div className="mt-4 flex flex-wrap items-start justify-center gap-3" aria-label="Fotos por color">{photoSlides.map((slide, index) => <button key={slide.id} type="button" onClick={() => setPhotoIndex(index)} aria-label={`Ver ${slide.label}`} aria-current={index === photoIndex ? "true" : undefined} className="group flex w-14 flex-col items-center gap-1 text-center"><span className={`grid size-8 place-items-center rounded-full border-2 transition ${index === photoIndex ? "border-[var(--ink)] ring-2 ring-[var(--lime)]" : "border-black/10"} ${colorSwatchClasses[slide.colorSlug ?? ""] ?? "bg-[#d9d4ca]"}`}><span className="size-2 rounded-full bg-white/80 opacity-0 group-hover:opacity-100" /></span><span className="max-w-full truncate text-[9px] font-bold text-[var(--muted)]">{slide.label}</span></button>)}</div></div></div> : null}
    {sheetModel?.technicalSheetUrl ? <div role="presentation" onClick={() => setSheetModel(null)} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="catalog-sheet-title" onClick={(event) => event.stopPropagation()} className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-[26px] bg-white p-3 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-5"><div className="flex items-center justify-between gap-3 px-1"><p id="catalog-sheet-title" className="eyebrow">Ficha técnica · {sheetModel.name}</p><button type="button" onClick={() => setSheetModel(null)} aria-label="Cerrar ficha técnica" className="grid size-9 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]"><X size={18} /></button></div><iframe title={`Ficha técnica de ${sheetModel.name}`} src={`${sheetModel.technicalSheetUrl}#view=FitH`} className="mt-3 min-h-0 flex-1 w-full rounded-xl border border-black/[0.08] bg-[#f6f3ed]" /><a href={sheetModel.technicalSheetUrl} target="_blank" rel="noreferrer" className="button-secondary mt-3 min-h-10 w-full px-3 py-2 text-xs sm:w-auto sm:self-end"><ExternalLink size={15} />Abrir ficha completa</a></div></div> : null}
  </>;
}
