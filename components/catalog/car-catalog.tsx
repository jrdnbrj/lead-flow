"use client";

import { ArrowLeft, ArrowRight, CarFront, Check, Download, ExternalLink, FileText, Image as ImageIcon, LoaderCircle, UsersRound, X } from "lucide-react";
import Image, { type ImageLoaderProps } from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

import { PdfViewer } from "@/components/catalog/pdf-viewer";
import { setCatalogModelDefaultColorAction } from "@/lib/catalog/actions";
import type { CatalogColor, CatalogModel } from "@/lib/catalog/repository";

const directImageLoader = ({ src }: ImageLoaderProps) => src;

type CatalogPhotoSlide = {
  id: string;
  label: string;
  imageUrl: string | null;
  fileName: string | null;
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
};

const colorOrder = ["blanco", "negro", "gris", "plateado", "plata", "rojo", "azul", "celeste", "verde", "naranja", "plateado-mate", "plata-mate", "plata-silver", "gris-plateado"];

function colorOrderIndex(color: CatalogColor): number {
  const index = colorOrder.indexOf(color.slug);
  return index >= 0 ? index : colorOrder.length;
}

function orderedColors(model: CatalogModel): CatalogColor[] {
  return [...model.colors].sort((left, right) => colorOrderIndex(left) - colorOrderIndex(right) || left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"));
}

function photoSlidesFor(model: CatalogModel): CatalogPhotoSlide[] {
  return orderedColors(model).map((color) => ({
    id: color.id,
    label: color.name,
    imageUrl: color.imageUrl ?? null,
    fileName: color.imageFileName ?? null,
    imageAlt: `${model.name} en color ${color.name}`,
    colorSlug: color.slug,
  }));
}

function firstColorId(model: CatalogModel): string | null {
  const colors = orderedColors(model);
  return model.defaultColorId ?? colors.find((color) => color.imageUrl)?.id ?? colors[0]?.id ?? null;
}

function colorFor(model: CatalogModel, colorId: string | undefined): CatalogColor | null {
  const colors = orderedColors(model);
  return colors.find((color) => color.id === colorId) ?? colors[0] ?? null;
}

function leadCountLabel(count: number | null): string {
  if (count === null) return "— leads";
  return `${count} ${count === 1 ? "lead" : "leads"}`;
}

type DownloadStatus = "idle" | "loading" | "success" | "error";

function downloadStatusLabel(status: DownloadStatus): string | null {
  if (status === "loading") return "Descargando…";
  if (status === "success") return "Descarga lista";
  if (status === "error") return "No se pudo descargar";
  return null;
}

export function CarCatalog({ models }: { models: CatalogModel[] }) {
  const [photoModel, setPhotoModel] = useState<CatalogModel | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [sheetModel, setSheetModel] = useState<CatalogModel | null>(null);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const [selectedColorByModel, setSelectedColorByModel] = useState<Record<string, string>>(() => Object.fromEntries(models.map((model) => [model.id, firstColorId(model) ?? ""])));
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [downloadState, setDownloadState] = useState<{ key: string | null; status: DownloadStatus }>({ key: null, status: "idle" });
  const modalHistoryEntry = useRef(false);
  const preloadedPhotoUrls = useRef(new Set<string>());
  const downloadResetTimer = useRef<number | null>(null);
  const defaultColorSaveQueues = useRef(new Map<string, Promise<void>>());
  const photoSlides = useMemo(() => photoModel ? photoSlidesFor(photoModel) : [], [photoModel]);
  const activePhoto = photoSlides[photoIndex] ?? photoSlides[0] ?? null;

  const preloadPhoto = useCallback((url: string | null | undefined) => {
    if (!url || preloadedPhotoUrls.current.has(url)) return;
    preloadedPhotoUrls.current.add(url);
    const image = new window.Image();
    image.decoding = "async";
    image.src = url;
  }, []);

  const preloadModelPhotos = useCallback((model: CatalogModel) => {
    model.colors.forEach((color) => preloadPhoto(color.imageUrl));
  }, [preloadPhoto]);

  const pushModalHistory = () => {
    if (modalHistoryEntry.current) return;
    window.history.pushState({ leadflowCatalogModal: true }, "");
    modalHistoryEntry.current = true;
  };

  const clearModal = useCallback(() => {
    setPhotoModel(null);
    setPhotoIndex(0);
    setSheetModel(null);
    setTouchStartX(null);
    setDownloadState({ key: null, status: "idle" });
  }, []);

  const closeModal = useCallback(() => {
    if (modalHistoryEntry.current) {
      window.history.back();
      return;
    }
    clearModal();
  }, [clearModal]);

  useEffect(() => {
    const closeOnPopState = () => {
      modalHistoryEntry.current = false;
      clearModal();
    };
    window.addEventListener("popstate", closeOnPopState);
    return () => window.removeEventListener("popstate", closeOnPopState);
  }, [clearModal]);

  useEffect(() => {
    if (!photoModel && !sheetModel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
      if (photoModel && photoSlides.length > 1 && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setPhotoIndex((current) => (current + direction + photoSlides.length) % photoSlides.length);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeModal, photoModel, sheetModel, photoSlides.length]);

  const openPhotoViewer = (model: CatalogModel) => {
    const selectedColor = colorFor(model, selectedColorByModel[model.id]);
    const index = photoSlidesFor(model).findIndex((slide) => slide.id === selectedColor?.id);
    setPhotoModel(model);
    setPhotoIndex(index >= 0 ? index : 0);
    setSheetModel(null);
    setDownloadState({ key: null, status: "idle" });
    preloadModelPhotos(model);
    pushModalHistory();
  };

  const openSheetViewer = (model: CatalogModel) => {
    setSheetModel(model);
    setPhotoModel(null);
    setDownloadState({ key: null, status: "idle" });
    pushModalHistory();
  };

  const triggerDownload = useCallback(async (key: string, url: string, fileName: string) => {
    if (downloadState.status === "loading") return;
    if (downloadResetTimer.current !== null) window.clearTimeout(downloadResetTimer.current);
    setDownloadState({ key, status: "loading" });
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("DOWNLOAD_FAILED");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloadState({ key, status: "success" });
    } catch {
      setDownloadState({ key, status: "error" });
    } finally {
      downloadResetTimer.current = window.setTimeout(() => setDownloadState({ key: null, status: "idle" }), 2200);
    }
  }, [downloadState.status]);

  const selectColor = (model: CatalogModel, color: CatalogColor) => {
    const previousColorId = selectedColorByModel[model.id] ?? firstColorId(model) ?? "";
    setSelectedColorByModel((current) => ({ ...current, [model.id]: color.id }));
    preloadModelPhotos(model);
    const previousQueue = defaultColorSaveQueues.current.get(model.id) ?? Promise.resolve();
    const nextQueue = previousQueue.then(async () => {
      const response = await setCatalogModelDefaultColorAction({ modelId: model.id, colorId: color.id });
      if (!response.success) {
        setSelectedColorByModel((current) => current[model.id] === color.id ? { ...current, [model.id]: previousColorId } : current);
        console.error("[leadflow][catalog] default color was not persisted", { modelId: model.id, colorId: color.id });
      }
    }).catch(() => {
      setSelectedColorByModel((current) => current[model.id] === color.id ? { ...current, [model.id]: previousColorId } : current);
    });
    defaultColorSaveQueues.current.set(model.id, nextQueue);
    void nextQueue.finally(() => {
      if (defaultColorSaveQueues.current.get(model.id) === nextQueue) defaultColorSaveQueues.current.delete(model.id);
    });
  };

  const movePhoto = (direction: 1 | -1) => {
    if (photoSlides.length < 2) return;
    setPhotoIndex((current) => (current + direction + photoSlides.length) % photoSlides.length);
  };

  const onPhotoTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    if (Math.abs(distance) >= 40) movePhoto(distance < 0 ? 1 : -1);
    setTouchStartX(null);
  };

  if (models.length === 0) return <div className="rounded-[26px] border border-black/[0.06] bg-white p-6 text-sm font-semibold text-[var(--muted)]">No hay vehículos disponibles en el catálogo.</div>;

  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {models.map((model, modelIndex) => {
        const selectedColor = colorFor(model, selectedColorByModel[model.id]);
        const selectedPhoto = selectedColor?.imageUrl ?? null;
        const selectedPhotoFailed = selectedColor ? failedPhotoIds.has(selectedColor.id) : false;
        const canOpenPhotoViewer = model.colors.length > 0;
        return <article key={model.id} className="overflow-hidden rounded-[20px] border border-black/[0.06] bg-white shadow-[0_10px_32px_rgba(16,24,40,0.06)]" onMouseEnter={() => preloadModelPhotos(model)} onFocus={() => preloadModelPhotos(model)}>
          <button type="button" disabled={!canOpenPhotoViewer} onClick={() => openPhotoViewer(model)} aria-label={canOpenPhotoViewer ? `Ver fotos de ${model.name}` : `Foto no disponible de ${model.name}`} className="group relative block aspect-[16/9] w-full cursor-zoom-in overflow-hidden bg-[#f5f1e9] text-left disabled:cursor-default">
            {selectedPhoto && !selectedPhotoFailed ? <Image loader={directImageLoader} unoptimized src={selectedPhoto} alt={`${model.name} en color ${selectedColor?.name ?? ""}`} fill priority={modelIndex < 4} sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" onLoad={() => preloadModelPhotos(model)} onError={() => { if (selectedColor) setFailedPhotoIds((current) => new Set(current).add(selectedColor.id)); }} className="block object-cover transition duration-300 group-hover:scale-[1.02]" /> : <div className="flex size-full flex-col items-center justify-center gap-2 px-5 text-center text-xs font-bold text-[var(--muted)]"><ImageIcon size={24} />Foto no disponible</div>}
          </button>
          <div className="p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-2.5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h2 className="text-lg font-black tracking-[-0.04em]">{model.name}</h2><span title="Cantidad de leads registrados con este modelo" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f6f3ed] px-2 py-1 text-[9px] font-black text-[var(--muted)]"><UsersRound size={11} />{leadCountLabel(model.leadRegistrationCount)}</span>{model.technicalSheetUrl ? <button type="button" onClick={() => openSheetViewer(model)} aria-label={`Ver ficha técnica de ${model.name}`} className="inline-flex min-h-6 items-center gap-1 rounded-lg border border-transparent bg-[var(--lime)] px-1.5 py-0.5 text-[8px] font-black text-[var(--ink)] shadow-sm transition hover:brightness-95"><FileText size={10} />Ficha técnica<ExternalLink size={9} /></button> : <span className="inline-flex min-h-6 items-center gap-1 rounded-lg bg-[#f6f3ed] px-1.5 py-0.5 text-[8px] font-bold text-[var(--muted)]"><FileText size={10} />Sin ficha</span>}</div></div><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f6f3ed] text-[var(--muted)]"><CarFront size={16} /></span></div>
            <div className="mt-2.5">{model.colors.length ? <div className="flex flex-wrap gap-1.5" aria-label={`Colores de ${model.name}`}>{orderedColors(model).map((color) => { const selected = selectedColor?.id === color.id; return <button key={color.id} type="button" onClick={() => selectColor(model, color)} aria-pressed={selected} title={`Ver ${color.name}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold transition ${selected ? "border-[var(--ink)] bg-[var(--lime)] text-[var(--ink)] shadow-sm" : "border-black/[0.08] bg-[#faf9f6] text-[var(--ink)] hover:border-[var(--ink)]"}`}><span aria-hidden="true" className={`size-3.5 rounded-full border border-black/10 ring-1 ring-black/10 ${colorSwatchClasses[color.slug] ?? "bg-[#d9d4ca]"}`} />{color.name}</button>; })}</div> : <p className="text-xs font-semibold text-[var(--muted)]">Colores por confirmar</p>}</div>
          </div>
        </article>;
      })}
    </div>
    {photoModel && activePhoto ? <div role="presentation" onClick={closeModal} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/75 p-3 backdrop-blur-sm sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="catalog-photo-title" onClick={(event) => event.stopPropagation()} className="relative flex max-h-[96vh] w-full max-w-5xl flex-col rounded-[24px] bg-white p-3 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:p-5"><button type="button" onClick={closeModal} aria-label="Cerrar foto" className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]"><X size={16} /></button><div className="flex items-start justify-between gap-3 pr-10"><div><p id="catalog-photo-title" className="eyebrow">{photoModel.name}</p><p className="mt-1 text-sm font-black text-[var(--ink)]">{activePhoto.label}</p></div><div className="flex shrink-0 items-center gap-2"><span title="Cantidad de leads registrados con este modelo" className="inline-flex items-center gap-1 rounded-full bg-[#f6f3ed] px-2.5 py-1 text-[9px] font-black text-[var(--muted)]"><UsersRound size={11} />{leadCountLabel(photoModel.leadRegistrationCount)}</span><span className="rounded-full bg-[#f6f3ed] px-2.5 py-1 text-[10px] font-black text-[var(--muted)]">{photoIndex + 1} / {photoSlides.length}</span></div></div><div className="relative mt-3 aspect-video w-full shrink-0 overflow-hidden rounded-2xl bg-[#f5f1e9] leading-none" onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)} onTouchEnd={onPhotoTouchEnd}>{activePhoto.imageUrl && !failedPhotoIds.has(activePhoto.id) ? <Image loader={directImageLoader} unoptimized priority fetchPriority="high" src={activePhoto.imageUrl} alt={activePhoto.imageAlt} fill onLoad={() => preloadModelPhotos(photoModel)} onError={() => { setFailedPhotoIds((current) => new Set(current).add(activePhoto.id)); }} className="block object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center text-sm font-bold text-[var(--muted)]"><ImageIcon size={28} /><span>Foto de {activePhoto.label} no disponible todavía</span></div>}{photoSlides.length > 1 ? <><button type="button" onClick={() => movePhoto(-1)} aria-label="Foto anterior" className="absolute left-2 grid size-9 place-items-center rounded-full bg-white/90 text-[var(--ink)] shadow-sm"><ArrowLeft size={17} /></button><button type="button" onClick={() => movePhoto(1)} aria-label="Foto siguiente" className="absolute right-2 grid size-9 place-items-center rounded-full bg-white/90 text-[var(--ink)] shadow-sm"><ArrowRight size={17} /></button></> : null}</div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-[10px] font-black text-[var(--muted)]">{photoIndex + 1} / {photoSlides.length}</span>{activePhoto.imageUrl ? <div className="flex items-center gap-2"><span aria-live="polite" className={`text-[10px] font-bold ${downloadState.key === `photo:${activePhoto.id}` && downloadState.status === "error" ? "text-red-600" : "text-[var(--muted)]"}`}>{downloadState.key === `photo:${activePhoto.id}` ? downloadStatusLabel(downloadState.status) : null}</span><button type="button" disabled={downloadState.status === "loading"} onClick={() => void triggerDownload(`photo:${activePhoto.id}`, `/api/catalog/photo/${encodeURIComponent(activePhoto.id)}`, activePhoto.fileName ?? `${photoModel.name} - ${activePhoto.label}.jpg`)} aria-label={`Descargar foto de ${photoModel.name} en color ${activePhoto.label}`} title="Descargar foto" className="grid size-8 place-items-center rounded-lg bg-[#f6f3ed] text-[var(--ink)] transition hover:bg-[#ece8de] disabled:cursor-wait disabled:opacity-60">{downloadState.key === `photo:${activePhoto.id}` && downloadState.status === "loading" ? <LoaderCircle size={14} className="animate-spin" /> : downloadState.key === `photo:${activePhoto.id}` && downloadState.status === "success" ? <Check size={14} /> : <Download size={14} />}</button></div> : <span className="text-[10px] font-bold text-[var(--muted)]">Foto no disponible</span>}</div><div className="mt-3 flex flex-wrap items-start justify-center gap-2.5" aria-label="Fotos por color">{photoSlides.map((slide, index) => <button key={slide.id} type="button" onClick={() => { setPhotoIndex(index); preloadPhoto(slide.imageUrl); }} aria-label={`Ver ${slide.label}`} aria-current={index === photoIndex ? "true" : undefined} className="group flex w-14 flex-col items-center gap-1 text-center"><span className={`grid size-8 place-items-center rounded-full border-2 transition ${index === photoIndex ? "border-[var(--ink)] ring-2 ring-[var(--lime)]" : "border-black/10"} ${colorSwatchClasses[slide.colorSlug ?? ""] ?? "bg-[#d9d4ca]"}`}><span className="size-2 rounded-full bg-white/80 opacity-0 group-hover:opacity-100" /></span><span className="max-w-full truncate text-[9px] font-bold text-[var(--muted)]">{slide.label}</span></button>)}</div></div></div> : null}
    {sheetModel?.technicalSheetUrl ? <div role="presentation" onClick={closeModal} className="fixed inset-0 z-[70] grid place-items-center bg-[#101828]/75 p-3 backdrop-blur-sm sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="catalog-sheet-title" onClick={(event) => event.stopPropagation()} className="relative flex h-[94vh] w-full min-w-0 max-w-5xl flex-col rounded-[24px] bg-white p-3 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:h-[92vh] sm:p-5"><div className="flex items-center justify-between gap-3 px-1"><div className="flex min-w-0 items-center gap-2"><p id="catalog-sheet-title" className="eyebrow truncate">Ficha técnica · {sheetModel.name}</p><span title="Cantidad de leads registrados con este modelo" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f6f3ed] px-2 py-1 text-[9px] font-black text-[var(--muted)]"><UsersRound size={11} />{leadCountLabel(sheetModel.leadRegistrationCount)}</span></div><div className="flex shrink-0 items-center gap-1"><a href={sheetModel.technicalSheetViewerUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ficha técnica completa de ${sheetModel.name}`} title="Abrir ficha completa" className="grid size-8 place-items-center rounded-lg bg-[#f6f3ed] text-[var(--ink)] transition hover:bg-[#ece8de]"><ExternalLink size={14} /></a><div className="flex items-center gap-1"><span aria-live="polite" className={`text-[10px] font-bold ${downloadState.key === `sheet:${sheetModel.id}` && downloadState.status === "error" ? "text-red-600" : "text-[var(--muted)]"}`}>{downloadState.key === `sheet:${sheetModel.id}` ? downloadStatusLabel(downloadState.status) : null}</span><button type="button" disabled={downloadState.status === "loading"} onClick={() => void triggerDownload(`sheet:${sheetModel.id}`, `${sheetModel.technicalSheetViewerUrl}?download=1`, `${sheetModel.name} - Ficha técnica.pdf`)} aria-label={`Descargar ficha técnica de ${sheetModel.name}`} title="Descargar ficha técnica" className="grid size-8 place-items-center rounded-lg bg-[#f6f3ed] text-[var(--ink)] transition hover:bg-[#ece8de] disabled:cursor-wait disabled:opacity-60">{downloadState.key === `sheet:${sheetModel.id}` && downloadState.status === "loading" ? <LoaderCircle size={14} className="animate-spin" /> : downloadState.key === `sheet:${sheetModel.id}` && downloadState.status === "success" ? <Check size={14} /> : <Download size={14} />}</button></div><button type="button" onClick={closeModal} aria-label="Cerrar ficha técnica" className="grid size-8 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]"><X size={16} /></button></div></div><PdfViewer url={sheetModel.technicalSheetUrl} title={`Ficha técnica de ${sheetModel.name}`} /></div></div> : null}
  </>;
}
