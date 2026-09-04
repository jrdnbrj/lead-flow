"use client";

import { Check, Download, ExternalLink, FileText, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PdfViewer } from "@/components/catalog/pdf-viewer";
import { CardQuoteCalculator } from "@/components/quotes/card-quote-calculator";
import { calculateCardQuote, validateCardQuote, formatCardCurrency, type CardQuoteDraft } from "@/lib/financial/card-quote";
import { getQuoteFilesAction, generateCardQuotePdfAction } from "@/lib/quotes/actions";
import { createCardQuoteSnapshot, quoteSnapshotsEquivalent } from "@/lib/quotes/snapshot";
import type { GeneratedQuoteFile, QuoteFileSummary, QuoteLeadOption } from "@/lib/quotes/types";

type QuoteWorkspaceProps = { leadOptions: QuoteLeadOption[] };

function quoteFileUrl(id: string, download = false): string {
  return `/api/quotes/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}

function formatGeneratedDate(value: string): string {
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "America/Guayaquil" }).format(new Date(value));
}

export function QuoteWorkspace({ leadOptions }: QuoteWorkspaceProps) {
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [draft, setDraft] = useState<CardQuoteDraft>({ modality: "NORMAL", term: null, amount: null });
  const [history, setHistory] = useState<QuoteFileSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedQuoteFile | null>(null);
  const [previewFile, setPreviewFile] = useState<QuoteFileSummary | GeneratedQuoteFile | null>(null);

  const selectedLead = useMemo(() => leadOptions.find((lead) => lead.id === selectedLeadId) ?? null, [leadOptions, selectedLeadId]);
  const selectedModel = useMemo(() => selectedLead?.models.find((model) => model.id === selectedModelId) ?? null, [selectedLead, selectedModelId]);
  const quote = calculateCardQuote(draft);
  const validation = validateCardQuote(draft);
  const currentSnapshot = quote && selectedLead && selectedModel
    ? createCardQuoteSnapshot({ leadId: selectedLead.id, clientName: selectedLead.fullName, clientPhone: selectedLead.phone, modelId: selectedModel.id, modelName: selectedModel.name, quote })
    : null;
  const generatedIsCurrent = Boolean(generated && currentSnapshot && quoteSnapshotsEquivalent(generated.snapshot, currentSnapshot));

  useEffect(() => {
    if (!selectedLeadId) return;
    let active = true;
    void getQuoteFilesAction({ leadId: selectedLeadId }).then((result) => {
      if (!active) return;
      if (result.success) {
        const data = result.data;
        if (data) setHistory(data);
      }
      else setHistoryError(result.error ?? "No pudimos cargar las cotizaciones anteriores.");
    }).catch(() => {
      if (active) setHistoryError("No pudimos cargar las cotizaciones anteriores.");
    }).finally(() => {
      if (active) setIsLoadingHistory(false);
    });
    return () => { active = false; };
  }, [selectedLeadId]);

  function handleLeadChange(nextLeadId: string) {
    const nextLead = leadOptions.find((lead) => lead.id === nextLeadId);
    setSelectedLeadId(nextLeadId);
    setSelectedModelId(nextLead?.models.length === 1 ? nextLead.models[0].id : "");
    setHistory([]);
    setHistoryError(null);
    setIsLoadingHistory(Boolean(nextLeadId));
  }

  function handleDraftChange(nextDraft: CardQuoteDraft) {
    setDraft(nextDraft);
    setGenerationError(null);
  }

  async function generatePdf() {
    if (!selectedLead || !selectedModel || !quote || isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    const result = await generateCardQuotePdfAction({ leadId: selectedLead.id, modelId: selectedModel.id, amount: String(draft.amount ?? ""), modality: draft.modality, term: draft.term });
    if (result.success && result.data) {
      const generatedFile = result.data;
      setGenerated(generatedFile);
      setHistory((current) => [generatedFile, ...current.filter((file) => file.id !== generatedFile.id)]);
    } else {
      setGenerationError(result.error ?? "No pudimos generar la cotización.");
    }
    setIsGenerating(false);
  }

  return <div className="space-y-4">
    <CardQuoteCalculator description="Calcula una cuota de Tarjeta de crédito sin lead, cliente ni vehículo." onDraftChange={handleDraftChange} />

    <section className="rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.06)] sm:p-5" aria-labelledby="quote-document-title">
      <div>
        <p className="eyebrow">Documento para cliente</p>
        <h2 id="quote-document-title" className="mt-1 text-lg font-black">Generar cotización</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">El cálculo es independiente. Para crear el PDF selecciona el cliente y el modelo que aparecerán en el documento.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-black text-[var(--ink)]">Cliente
          <select value={selectedLeadId} onChange={(event) => handleLeadChange(event.target.value)} className="field-input mt-1.5">
            <option value="">Selecciona un cliente</option>
            {leadOptions.map((lead) => <option key={lead.id} value={lead.id}>{lead.fullName} · {lead.phone}</option>)}
          </select>
        </label>
        <label className="block text-xs font-black text-[var(--ink)]">Modelo
          <select value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)} disabled={!selectedLead || selectedLead.models.length === 0} className="field-input mt-1.5 disabled:cursor-not-allowed disabled:opacity-55">
            <option value="">{selectedLead?.models.length ? "Selecciona un modelo" : "Este cliente no tiene un modelo del catálogo"}</option>
            {selectedLead?.models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
      </div>

      {selectedLead && selectedLead.models.length > 1 && !selectedModel ? <p className="mt-2 text-[11px] font-semibold text-[#8a5b00]">Este cliente tiene varios modelos. Escoge cuál aparecerá en la cotización.</p> : null}
      {generationError ? <p className="mt-3 rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]" role="alert">{generationError}</p> : null}

      <div className="mt-4 flex flex-col gap-2 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] text-[var(--muted)]">
          {quote ? <span>{formatCardCurrency(quote.amount)} · {quote.term} meses · {formatCardCurrency(quote.installment)}/mes</span> : <span>{validation.valid ? "Completa la cotización." : validation.message}</span>}
        </div>
        <button type="button" onClick={() => void generatePdf()} disabled={isGenerating || !quote || !selectedLead || !selectedModel} className="button-primary min-h-10 justify-center px-4 text-xs disabled:cursor-not-allowed disabled:opacity-55">
          {isGenerating ? <LoaderCircle size={15} className="animate-spin" /> : <FileText size={15} />}
          {isGenerating ? "Generando…" : "Generar PDF"}
        </button>
      </div>

      {generated ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-black text-emerald-900">Cotización generada</p><p className="mt-1 text-[11px] text-emerald-800">{generated.modelName} · {formatGeneratedDate(generated.generatedAt)}</p></div>
          <Check size={17} className="mt-0.5 shrink-0 text-emerald-700" />
        </div>
        {!generatedIsCurrent ? <p className="mt-2 text-[11px] font-semibold leading-4 text-[#8a5b00]">Cambiaste la cotización. Se generará un PDF actualizado cuando corresponda.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPreviewFile(generated)} className="button-secondary min-h-9 px-3 py-1.5 text-[11px]"><ExternalLink size={14} />Ver PDF</button>
          <a href={quoteFileUrl(generated.id, true)} className="button-secondary min-h-9 px-3 py-1.5 text-[11px]"><Download size={14} />Descargar</a>
        </div>
      </div> : null}
    </section>

    {selectedLead ? <section className="rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.06)] sm:p-5" aria-labelledby="quote-history-title">
      <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Histórico</p><h2 id="quote-history-title" className="mt-1 text-lg font-black">Cotizaciones anteriores</h2></div>{isLoadingHistory ? <LoaderCircle size={17} className="animate-spin text-[var(--muted)]" /> : null}</div>
      {historyError ? <p className="mt-3 text-xs font-semibold text-[#b33a2c]" role="alert">{historyError}</p> : null}
      {!isLoadingHistory && !historyError && history.length === 0 ? <p className="mt-3 text-xs text-[var(--muted)]">Todavía no hay PDFs generados para este cliente.</p> : null}
            {history.length > 0 ? <div className="mt-3 divide-y divide-black/[0.06]">{history.map((file) => <div key={file.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-black text-[var(--ink)]">{file.modelName}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{formatGeneratedDate(file.generatedAt)} · {formatCardCurrency(file.amount)} · {file.term} meses</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => setPreviewFile(file)} className="button-secondary min-h-8 px-2.5 py-1 text-[10px]"><ExternalLink size={13} />Ver PDF</button><a href={quoteFileUrl(file.id, true)} className="button-secondary min-h-8 px-2.5 py-1 text-[10px]" aria-label={`Descargar cotización de ${file.modelName}`}><Download size={13} />Descargar</a></div></div>)}</div> : null}
    </section> : null}

    {previewFile ? <div role="presentation" onClick={() => setPreviewFile(null)} className="fixed inset-0 z-[80] grid place-items-center bg-[#101828]/70 p-2 backdrop-blur-sm sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="quote-preview-title" onClick={(event) => event.stopPropagation()} className="relative flex h-[96vh] w-full min-w-0 max-w-4xl flex-col rounded-[24px] bg-white p-3 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:h-[92vh] sm:p-5"><div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-3"><div className="min-w-0"><p className="eyebrow">Cotización</p><h2 id="quote-preview-title" className="truncate text-sm font-black">{previewFile.modelName}</h2></div><div className="flex shrink-0 items-center gap-2"><a href={quoteFileUrl(previewFile.id, true)} className="grid size-8 place-items-center rounded-lg bg-[#f6f3ed] text-[var(--ink)]" aria-label="Descargar cotización" title="Descargar"><Download size={15} /></a><button type="button" onClick={() => setPreviewFile(null)} className="grid size-8 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]" aria-label="Cerrar PDF"><X size={17} /></button></div></div><PdfViewer url={quoteFileUrl(previewFile.id)} title={`Cotización de ${previewFile.modelName}`} /></div></div> : null}
  </div>;
}
