"use client";

import { Download, Eye, FileText, LoaderCircle, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { purchaseCaseDocumentLabels, purchaseCaseDocumentTypes, singleActivePurchaseCaseDocumentTypes, type PurchaseCaseDocumentAccess, type PurchaseCaseDocumentType } from "@/lib/postpurchase-documents/types";

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isSingleType(type: PurchaseCaseDocumentType): boolean {
  return singleActivePurchaseCaseDocumentTypes.includes(type);
}

export function PostPurchaseDocuments({ purchaseCaseId, paused }: { purchaseCaseId: string; paused: boolean }) {
  const [documents, setDocuments] = useState<PurchaseCaseDocumentAccess[]>([]);
  const [selectedType, setSelectedType] = useState<PurchaseCaseDocumentType>("INVOICE");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/postpurchase/documents?purchaseCaseId=${encodeURIComponent(purchaseCaseId)}`, { cache: "no-store" });
      const payload = await response.json() as { documents?: PurchaseCaseDocumentAccess[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "DOCUMENTS_LOOKUP_FAILED");
      setDocuments(payload.documents ?? []);
    } catch {
      setError("No pudimos cargar los documentos. Puedes reintentarlo.");
    } finally {
      setIsLoading(false);
    }
  }, [purchaseCaseId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadDocuments(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadDocuments]);

  const currentSingleDocument = useMemo(() => isSingleType(selectedType) ? documents.find((document) => document.documentType === selectedType) ?? null : null, [documents, selectedType]);

  async function uploadDocument() {
    if (paused || isUploading || !selectedFile) return;
    setIsUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("purchaseCaseId", purchaseCaseId);
      body.set("documentType", selectedType);
      if (currentSingleDocument && isSingleType(selectedType)) body.set("replaceDocumentId", currentSingleDocument.id);
      body.set("file", selectedFile);
      const response = await fetch("/api/postpurchase/documents", { method: "POST", body });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "DOCUMENT_UPLOAD_FAILED");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
    } catch (uploadError) {
      if (uploadError instanceof Error && uploadError.message.includes("DOCUMENT_REPLACEMENT")) setError("El documento cambió mientras lo subías. Actualiza la lista e inténtalo de nuevo.");
      else setError("No pudimos guardar el documento. Puedes reintentarlo.");
    } finally {
      setIsUploading(false);
    }
  }

  async function accessDocument(document: PurchaseCaseDocumentAccess, download: boolean) {
    if (busyDocumentId) return;
    const popup = download ? null : window.open("about:blank", "_blank");
    setBusyDocumentId(document.id);
    setError(null);
    try {
      const response = await fetch(`/api/postpurchase/documents/${document.id}`, { cache: "no-store" });
      const payload = await response.json() as { url?: string; fileName?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "DOCUMENT_UNAVAILABLE");
      if (download) {
        const link = window.document.createElement("a");
        link.href = payload.url;
        link.download = payload.fileName || document.originalFilename;
        link.target = "_blank";
        link.rel = "noreferrer";
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      } else if (popup) {
        popup.location.href = payload.url;
      } else {
        window.open(payload.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      popup?.close();
      setError("No pudimos abrir el documento. Puedes reintentarlo.");
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function deleteDocument(document: PurchaseCaseDocumentAccess) {
    if (paused || busyDocumentId || !window.confirm(`¿Ocultar ${purchaseCaseDocumentLabels[document.documentType]} del caso?`)) return;
    setBusyDocumentId(document.id);
    setError(null);
    try {
      const response = await fetch(`/api/postpurchase/documents/${document.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("DOCUMENT_DELETE_FAILED");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch {
      setError("No pudimos ocultar el documento. Puedes reintentarlo.");
    } finally {
      setBusyDocumentId(null);
    }
  }

  return <section className="mt-3 rounded-xl border border-black/[0.06] bg-white p-2.5" aria-label="Documentos de Postcompra">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-xs font-black text-[var(--ink)]">Documentos del caso</h3><p className="mt-0.5 text-[10px] font-semibold text-[var(--muted)]">Guarda facturas, RAMV y comprobantes para tenerlos a mano.</p></div>
      {paused ? <span className="rounded-full bg-[#fff0bd] px-2 py-1 text-[10px] font-black text-[#765000]">Sólo lectura</span> : null}
    </div>
    {error ? <p className="mt-2 flex items-start gap-2 rounded-lg bg-[#fff0ee] px-2.5 py-2 text-[11px] font-semibold text-[#b33a2c]" role="alert"><TriangleAlert size={13} className="mt-0.5 shrink-0" />{error}</p> : null}
    {!paused ? <div className="mt-2 grid gap-1.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_auto] sm:items-end">
      <label className="block text-[10px] font-black text-[var(--muted)]">Tipo<select value={selectedType} onChange={(event) => setSelectedType(event.target.value as PurchaseCaseDocumentType)} className="field-input mt-1 h-9 w-full px-2 text-xs">{purchaseCaseDocumentTypes.map((type) => <option key={type} value={type}>{purchaseCaseDocumentLabels[type]}</option>)}</select></label>
      <label className="block text-[10px] font-black text-[var(--muted)]">Archivo<input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="mt-1 block h-9 w-full min-w-0 rounded-lg border border-black/[0.08] bg-[#faf9f6] px-2 py-1.5 text-[11px] font-semibold text-[var(--muted)] file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-1.5 file:py-1 file:text-[10px] file:font-black" /></label>
      <button type="button" disabled={!selectedFile || isUploading} onClick={() => void uploadDocument()} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#e4f8e9] px-3 text-[11px] font-black text-[#18733a] disabled:cursor-not-allowed disabled:opacity-50">{isUploading ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}{isUploading ? "Guardando…" : currentSingleDocument ? "Reemplazar" : "Guardar"}</button>
    </div> : null}
    {isLoading ? <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-[var(--muted)]"><LoaderCircle size={13} className="animate-spin" />Cargando documentos…</p> : documents.length === 0 ? <p className="mt-3 text-[11px] font-semibold text-[var(--muted)]">Todavía no hay documentos guardados.</p> : <div className="mt-2 grid gap-1.5">{documents.map((document) => <div key={document.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-black/[0.06] bg-[#faf9f6] px-2 py-1.5"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-white text-[var(--muted)]"><FileText size={14} /></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-black text-[var(--ink)]">{purchaseCaseDocumentLabels[document.documentType]}</p><p className="truncate text-[10px] font-semibold text-[var(--muted)]">{document.originalFilename} · {formatBytes(document.sizeBytes)}</p></div><div className="flex shrink-0 items-center gap-1">{busyDocumentId === document.id ? <LoaderCircle size={14} className="animate-spin text-[var(--muted)]" /> : <><button type="button" aria-label={`Ver ${purchaseCaseDocumentLabels[document.documentType]}`} title="Ver" onClick={() => void accessDocument(document, false)} className="grid size-7 place-items-center rounded-md bg-white text-[var(--muted)] hover:text-[var(--ink)]"><Eye size={14} /></button><button type="button" aria-label={`Descargar ${purchaseCaseDocumentLabels[document.documentType]}`} title="Descargar" onClick={() => void accessDocument(document, true)} className="grid size-7 place-items-center rounded-md bg-white text-[var(--muted)] hover:text-[var(--ink)]"><Download size={14} /></button>{!paused ? <button type="button" aria-label={`Ocultar ${purchaseCaseDocumentLabels[document.documentType]}`} title="Ocultar" onClick={() => void deleteDocument(document)} className="grid size-7 place-items-center rounded-md bg-white text-[var(--muted)] hover:text-[#b33a2c]"><Trash2 size={14} /></button> : null}</>}</div></div>)}</div>}
  </section>;
}
