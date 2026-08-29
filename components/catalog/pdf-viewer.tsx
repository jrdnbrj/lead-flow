"use client";

import { FileText, LoaderCircle, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void> | void;
};

type PdfPage = {
  getViewport: (parameters: { scale: number }) => { width: number; height: number };
  render: (parameters: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: [number, number, number, number, number, number] }) => PdfRenderTask;
};

type PdfRenderTask = { promise: Promise<void>; cancel: () => void };

type PdfStatus = "loading" | "ready" | "error";

const pdfWorkerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export function PdfViewer({ url, title }: { url: string; title: string }) {
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const viewerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  const [status, setStatus] = useState<PdfStatus>("loading");
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const loadDocument = async () => {
      setStatus("loading");
      setError(null);
      setPageCount(0);
      canvasRefs.current = {};
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const loadingTask = pdfjs.getDocument({ url });
        const document = await loadingTask.promise as unknown as PdfDocument;
        if (disposed) {
          await document.destroy();
          return;
        }
        documentRef.current = document;
        setPageCount(document.numPages);
        setStatus("ready");
      } catch {
        if (!disposed) {
          setStatus("error");
          setError("No se pudo mostrar la ficha en este dispositivo.");
        }
      }
    };
    void loadDocument();
    return () => {
      disposed = true;
      const document = documentRef.current;
      documentRef.current = null;
      if (document) void document.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (status !== "ready" || !documentRef.current || pageCount === 0) return;
    let disposed = false;
    const renderTasks: PdfRenderTask[] = [];
    const renderPages = async () => {
      try {
        const document = documentRef.current;
        if (!document) return;
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          if (disposed) return;
          const canvas = canvasRefs.current[pageNumber];
          if (!canvas) continue;
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(160, (viewerRef.current?.clientWidth ?? 720) - 24);
          const fitScale = Math.min(1.5, Math.max(0.12, availableWidth / baseViewport.width));
          const viewport = page.getViewport({ scale: fitScale * zoom });
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("CANVAS_UNAVAILABLE");
          context.clearRect(0, 0, canvas.width, canvas.height);
          const renderTask = page.render({
            canvasContext: context,
            viewport,
            transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
          });
          renderTasks.push(renderTask);
          await renderTask.promise;
        }
      } catch {
        if (!disposed) setError("No se pudo renderizar la ficha.");
      }
    };
    void renderPages();
    return () => {
      disposed = true;
      renderTasks.forEach((renderTask) => renderTask.cancel());
    };
  }, [pageCount, status, zoom]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/[0.08] bg-[#f5f1e9]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-white px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-black text-[var(--muted)]">
          <FileText size={14} />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.8, Number((value - 0.1).toFixed(1))))} disabled={status !== "ready" || zoom <= 0.8} aria-label="Alejar ficha" className="grid size-7 place-items-center rounded-lg text-[var(--ink)] transition hover:bg-[#f6f3ed] disabled:opacity-35"><ZoomOut size={14} /></button>
          <span className="min-w-10 text-center text-[10px] font-black text-[var(--muted)]">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.1).toFixed(1))))} disabled={status !== "ready" || zoom >= 1.8} aria-label="Acercar ficha" className="grid size-7 place-items-center rounded-lg text-[var(--ink)] transition hover:bg-[#f6f3ed] disabled:opacity-35"><ZoomIn size={14} /></button>
        </div>
      </div>
      <div ref={viewerRef} className="min-h-0 min-w-0 flex-1 overflow-auto p-2 sm:p-3">
        {status === "loading" ? <div className="grid min-h-56 place-items-center text-xs font-bold text-[var(--muted)]"><span className="inline-flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" />Cargando ficha…</span></div> : null}
        {status === "error" ? <div className="grid min-h-56 place-items-center px-5 text-center text-xs font-bold text-[var(--muted)]">{error ?? "No se pudo cargar la ficha."}</div> : null}
        {status === "ready" ? <div className="flex min-w-full flex-col items-center gap-3">
          {Array.from({ length: pageCount }, (_, pageIndex) => {
            const pageNumber = pageIndex + 1;
            return <div key={pageNumber} className="w-max min-w-full text-center leading-none"><canvas ref={(node) => { canvasRefs.current[pageNumber] = node; }} aria-label={`Página ${pageNumber} de ${pageCount} de ${title}`} className="inline-block bg-white align-top shadow-sm" /></div>;
          })}
        </div> : null}
      </div>
      <div className="flex shrink-0 items-center justify-center border-t border-black/[0.06] bg-white px-2.5 py-2 text-[10px] font-black text-[var(--muted)]">
        {status === "ready" ? `${pageCount} ${pageCount === 1 ? "página" : "páginas"}` : "—"}
      </div>
    </div>
  );
}
