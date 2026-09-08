"use client";

import { Check, Download, ExternalLink, FileText, LoaderCircle, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PdfViewer } from "@/components/catalog/pdf-viewer";
import { CardQuoteCalculator } from "@/components/quotes/card-quote-calculator";
import { NovaCreditCalculator } from "@/components/quotes/novacredit-calculator";
import { calculateCardQuote, formatCardCurrency, validateCardQuote, type CardQuoteDraft } from "@/lib/financial/card-quote";
import { calculateNovaCreditQuote, novaCreditRules, validateNovaCreditQuote, type NovaCreditDraft } from "@/lib/financial/novacredit";
import { generateCardQuotePdfAction, generateNovaCreditQuotePdfAction, getQuoteFilesAction, prepareCardQuoteSendAction, prepareNovaCreditQuoteSendAction, sendCardQuoteAction, sendNovaCreditQuoteAction } from "@/lib/quotes/actions";
import { createCardQuoteSnapshot, createNovaCreditSnapshot, quoteSnapshotsEquivalent } from "@/lib/quotes/snapshot";
import type { SellerProfile } from "@/lib/domain/lead";
import type { GeneratedQuoteFile, PreparedQuoteForSend, QuoteCatalogModel, QuoteFileSummary, QuoteLeadOption } from "@/lib/quotes/types";

type QuoteWorkspaceProps = {
  leadOptions: QuoteLeadOption[];
  catalogModels: QuoteCatalogModel[];
  sellerProfile: SellerProfile;
  initialLeadId?: string | null;
};

type QuoteMode = "CARD" | "NOVACREDIT";

function quoteFileUrl(id: string, download = false): string {
  return `/api/quotes/files/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}

function formatGeneratedDate(value: string): string {
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "America/Guayaquil" }).format(new Date(value));
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").replace(/[^\p{L}\d]+/gu, " ").trim().replace(/\s+/gu, " ").toLocaleLowerCase("es-EC");
}

export function QuoteWorkspace({ leadOptions, catalogModels, sellerProfile, initialLeadId = null }: QuoteWorkspaceProps) {
  const [quoteMode, setQuoteMode] = useState<QuoteMode>("CARD");
  const initialLead = initialLeadId ? leadOptions.find((lead) => lead.id === initialLeadId) ?? null : null;
  const [selectedLeadId, setSelectedLeadId] = useState(initialLead?.id ?? "");
  const [leadSearch, setLeadSearch] = useState(initialLead ? `${initialLead.fullName} · ${initialLead.phone}` : "");
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(initialLead?.models.length === 1 ? initialLead.models[0].id : "");
  const [draft, setDraft] = useState<CardQuoteDraft>({ modality: "NORMAL", term: null, amount: null });
  const [novaDraft, setNovaDraft] = useState<NovaCreditDraft>({ vehicleValue: null, accessories: null, downPayment: null, term: null, device: novaCreditRules.defaultDevice });
  const [history, setHistory] = useState<QuoteFileSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isPreparingSend, setIsPreparingSend] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedQuoteFile | null>(null);
  const [pendingNovaSend, setPendingNovaSend] = useState<PreparedQuoteForSend | null>(null);
  const [previewFile, setPreviewFile] = useState<QuoteFileSummary | GeneratedQuoteFile | null>(null);
  const leadPickerRef = useRef<HTMLDivElement>(null);

  const selectedLead = useMemo(() => leadOptions.find((lead) => lead.id === selectedLeadId) ?? null, [leadOptions, selectedLeadId]);
  const selectedModel = useMemo(() => catalogModels.find((model) => model.id === selectedModelId) ?? null, [catalogModels, selectedModelId]);
  const filteredLeads = useMemo(() => {
    const query = normalizeSearch(leadSearch.trim());
    if (!query) return leadOptions.slice(0, 8);
    return leadOptions.filter((lead) => normalizeSearch(`${lead.fullName} ${lead.phone}`).includes(query)).slice(0, 8);
  }, [leadOptions, leadSearch]);
  const cardQuote = calculateCardQuote(draft);
  const cardValidation = validateCardQuote(draft);
  const novaQuote = calculateNovaCreditQuote(novaDraft);
  const novaValidation = validateNovaCreditQuote(novaDraft);
  const quote = quoteMode === "CARD" ? cardQuote : novaQuote;
  const validation = quoteMode === "CARD" ? cardValidation : novaValidation;
  const currentSnapshot = quoteMode === "CARD" && cardQuote && selectedLead && selectedModel
    ? createCardQuoteSnapshot({
        leadId: selectedLead.id,
        clientName: selectedLead.fullName,
        clientPhone: selectedLead.phone,
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        quote: cardQuote,
        sellerName: sellerProfile.name,
        sellerPhone: sellerProfile.phone,
        sellerEmail: sellerProfile.email,
        sellerCompany: sellerProfile.company,
      }) : quoteMode === "NOVACREDIT" && novaQuote && selectedLead && selectedModel ? createNovaCreditSnapshot({
        leadId: selectedLead.id,
        clientName: selectedLead.fullName,
        clientPhone: selectedLead.phone,
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        quote: novaQuote,
        sellerName: sellerProfile.name,
        sellerPhone: sellerProfile.phone,
        sellerEmail: sellerProfile.email,
        sellerCompany: sellerProfile.company,
      })
    : null;
  const generatedIsCurrent = Boolean(generated && currentSnapshot && quoteSnapshotsEquivalent(generated.snapshot, currentSnapshot));
  const pendingNovaSnapshot = pendingNovaSend?.quoteFile.snapshot.quoteType === "NOVACREDIT" ? pendingNovaSend.quoteFile.snapshot : null;

  useEffect(() => {
    if (!isLeadPickerOpen) return;
    function closeLeadPicker(event: PointerEvent) {
      if (event.target instanceof Node && !leadPickerRef.current?.contains(event.target)) setIsLeadPickerOpen(false);
    }
    document.addEventListener("pointerdown", closeLeadPicker);
    return () => document.removeEventListener("pointerdown", closeLeadPicker);
  }, [isLeadPickerOpen]);

  useEffect(() => {
    if (!selectedLeadId) return;
    let active = true;
    void getQuoteFilesAction({ leadId: selectedLeadId }).then((result) => {
      if (!active) return;
      if (result.success) setHistory(result.data ?? []);
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
    setLeadSearch(nextLead ? `${nextLead.fullName} · ${nextLead.phone}` : "");
    setIsLeadPickerOpen(false);
    setSelectedModelId(nextLead?.models.length === 1 ? nextLead.models[0].id : "");
    setHistory([]);
    setHistoryError(null);
    setIsLoadingHistory(Boolean(nextLeadId));
    setGenerated(null);
    setPendingNovaSend(null);
    setSendError(null);
    setSendInfo(null);
  }

  function clearLead() {
    setSelectedLeadId("");
    setLeadSearch("");
    setSelectedModelId("");
    setHistory([]);
    setHistoryError(null);
    setGenerated(null);
    setPendingNovaSend(null);
    setSendError(null);
    setSendInfo(null);
  }

  function handleLeadSearchChange(value: string) {
    setLeadSearch(value);
    if (selectedLeadId) {
      setSelectedLeadId("");
      setSelectedModelId("");
      setHistory([]);
      setGenerated(null);
      setPendingNovaSend(null);
    }
    setSendError(null);
    setSendInfo(null);
    setIsLeadPickerOpen(true);
  }

  function handleDraftChange(nextDraft: CardQuoteDraft) {
    setDraft(nextDraft);
    setGenerationError(null);
    setSendError(null);
    setSendInfo(null);
  }

  function handleNovaDraftChange(nextDraft: NovaCreditDraft) {
    setNovaDraft(nextDraft);
    setGenerationError(null);
    setSendError(null);
    setSendInfo(null);
  }

  async function generatePdf() {
    if (!selectedLead || !selectedModel || !quote || isGenerating) return;
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const result = quoteMode === "CARD"
        ? await generateCardQuotePdfAction({ leadId: selectedLead.id, modelId: selectedModel.id, amount: String(draft.amount ?? ""), modality: draft.modality, term: draft.term })
        : await generateNovaCreditQuotePdfAction({ leadId: selectedLead.id, modelId: selectedModel.id, vehicleValue: String(novaDraft.vehicleValue ?? ""), accessories: String(novaDraft.accessories ?? ""), downPayment: String(novaDraft.downPayment ?? ""), term: novaDraft.term, device: String(novaDraft.device ?? "") });
      if (result.success && result.data) {
        const generatedFile = result.data;
        setGenerated(generatedFile);
        setHistory((current) => [generatedFile, ...current.filter((file) => file.id !== generatedFile.id)]);
      } else {
        setGenerationError(result.error ?? "No pudimos generar la cotización.");
      }
    } catch {
      setGenerationError("No pudimos generar la cotización. Intenta de nuevo.");
    }
    finally {
      setIsGenerating(false);
    }
  }

  async function sendQuote() {
    if (!selectedLead || !selectedModel || !quote || isPreparingSend || isSending) return;
    setIsPreparingSend(true);
    setSendError(null);
    setSendInfo(null);
    try {
      if (quoteMode === "NOVACREDIT") {
        const result = await prepareNovaCreditQuoteSendAction({ leadId: selectedLead.id, modelId: selectedModel.id, vehicleValue: String(novaDraft.vehicleValue ?? ""), accessories: String(novaDraft.accessories ?? ""), downPayment: String(novaDraft.downPayment ?? ""), term: novaDraft.term, device: String(novaDraft.device ?? ""), generatedQuoteFileId: generated?.id ?? null });
        if (result.success && result.data) {
          setGenerated(result.data.quoteFile);
          setHistory((current) => [result.data!.quoteFile, ...current.filter((file) => file.id !== result.data!.quoteFile.id)]);
          setPendingNovaSend(result.data);
        } else {
          setSendError(result.error ?? "No pudimos preparar la cotización para enviar.");
        }
        return;
      }

      const result = await prepareCardQuoteSendAction({ leadId: selectedLead.id, modelId: selectedModel.id, amount: String(draft.amount ?? ""), modality: draft.modality, term: draft.term, generatedQuoteFileId: generated?.id ?? null });
      if (result.success && result.data) {
        setGenerated(result.data.quoteFile);
        setHistory((current) => [result.data!.quoteFile, ...current.filter((file) => file.id !== result.data!.quoteFile.id)]);
        setIsSending(true);
        const sendResult = await sendCardQuoteAction({ leadId: selectedLead.id, modelId: selectedModel.id, amount: String(draft.amount ?? ""), modality: draft.modality, term: draft.term, preparedQuoteFileId: result.data.quoteFile.id });
        if (sendResult.success && sendResult.data) {
          setGenerated(sendResult.data.quoteFile);
          setHistory((current) => [sendResult.data!.quoteFile, ...current.filter((file) => file.id !== sendResult.data!.quoteFile.id)]);
          if (sendResult.data.status === "ACCEPTED") setSendInfo(sendResult.message ?? "Cotización enviada por WhatsApp.");
          else setSendError(sendResult.message ?? "No pudimos confirmar el envío. Verifica WhatsApp antes de intentar otro.");
        } else setSendError(sendResult.error ?? "No pudimos enviar la cotización. Verifica WhatsApp antes de intentar otro.");
      } else setSendError(result.error ?? "No pudimos preparar la cotización para enviar.");
    } catch {
      setSendError("No pudimos enviar la cotización. Verifica WhatsApp e intenta de nuevo.");
    } finally {
      setIsPreparingSend(false);
      setIsSending(false);
    }
  }

  async function confirmNovaCreditSend() {
    if (!pendingNovaSend || !selectedLead || !selectedModel || isSending) return;
    setIsSending(true);
    setSendError(null);
    setSendInfo(null);
    try {
      const result = await sendNovaCreditQuoteAction({ leadId: selectedLead.id, modelId: selectedModel.id, vehicleValue: String(novaDraft.vehicleValue ?? ""), accessories: String(novaDraft.accessories ?? ""), downPayment: String(novaDraft.downPayment ?? ""), term: novaDraft.term, device: String(novaDraft.device ?? ""), preparedQuoteFileId: pendingNovaSend.quoteFile.id });
      if (result.success && result.data) {
        setGenerated(result.data.quoteFile);
        setHistory((current) => [result.data!.quoteFile, ...current.filter((file) => file.id !== result.data!.quoteFile.id)]);
        setPendingNovaSend(null);
        setSendInfo(result.message ?? "Cotización preparada en modo local; no se envió por WhatsApp.");
      } else setSendError(result.error ?? "No pudimos preparar la cotización. Revisa los datos e intenta de nuevo.");
    } catch {
      setSendError("No pudimos preparar la cotización. Intenta de nuevo.");
    } finally {
      setIsSending(false);
    }
  }

  return <div className="space-y-4">
    <section className="rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.06)] sm:p-5" aria-labelledby="quote-mode-title">
      <p className="eyebrow">Herramienta global</p>
      <h2 id="quote-mode-title" className="mt-1 text-lg font-black">¿Qué quieres cotizar?</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" aria-pressed={quoteMode === "CARD"} onClick={() => setQuoteMode("CARD")} className={`rounded-xl border px-3 py-3 text-left text-xs font-black transition ${quoteMode === "CARD" ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-[#f6f3ed] text-[var(--ink)] hover:border-black/25"}`}>Tarjeta de crédito<span className={`mt-1 block text-[10px] font-semibold ${quoteMode === "CARD" ? "text-white/70" : "text-[var(--muted)]"}`}>Normal o Corporativo</span></button>
        <button type="button" aria-pressed={quoteMode === "NOVACREDIT"} onClick={() => setQuoteMode("NOVACREDIT")} className={`rounded-xl border px-3 py-3 text-left text-xs font-black transition ${quoteMode === "NOVACREDIT" ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-black/[0.08] bg-[#f6f3ed] text-[var(--ink)] hover:border-black/25"}`}>Crédito vehicular<span className={`mt-1 block text-[10px] font-semibold ${quoteMode === "NOVACREDIT" ? "text-white/70" : "text-[var(--muted)]"}`}>NovaCredit</span></button>
      </div>
    </section>

    {quoteMode === "NOVACREDIT" ? <NovaCreditCalculator onDraftChange={handleNovaDraftChange} /> : <CardQuoteCalculator description="Calcula una cuota de Tarjeta de crédito sin lead, cliente ni vehículo." onDraftChange={handleDraftChange} />}

    <section className="rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.06)] sm:p-5" aria-labelledby="quote-document-title">
      <div>
        <p className="eyebrow">Documento para cliente</p>
        <h2 id="quote-document-title" className="mt-1 text-lg font-black">Generar cotización</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">El cálculo es independiente. Para crear el PDF selecciona el cliente y el modelo que aparecerán en el documento.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div ref={leadPickerRef} className="relative">
          <label htmlFor="quote-client-search" className="block text-xs font-black text-[var(--ink)]">Cliente</label>
          <div className="relative mt-1.5">
            <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input id="quote-client-search" type="text" role="combobox" aria-haspopup="listbox" value={leadSearch} onChange={(event) => handleLeadSearchChange(event.target.value)} onFocus={() => setIsLeadPickerOpen(true)} placeholder="Buscar por nombre o número" autoComplete="off" className="field-input w-full" style={{ paddingLeft: "3rem", paddingRight: "3.5rem" }} aria-controls="quote-client-options" aria-expanded={isLeadPickerOpen} />
            {leadSearch ? <button type="button" onClick={clearLead} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted)] hover:bg-[#f6f3ed]" aria-label="Limpiar cliente"><X size={14} /></button> : null}
          </div>
          {isLeadPickerOpen ? <div id="quote-client-options" role="listbox" className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-y-auto rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-[0_16px_40px_rgba(16,24,40,0.14)]">
            {filteredLeads.length ? filteredLeads.map((lead) => <button key={lead.id} type="button" role="option" aria-selected={lead.id === selectedLeadId} onClick={() => handleLeadChange(lead.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[#f6f3ed] aria-selected:bg-[#eef6d7]"><span className="min-w-0"><span className="block truncate text-xs font-black text-[var(--ink)]">{lead.fullName}</span><span className="mt-0.5 block text-[11px] font-semibold text-[var(--muted)]">{lead.phone}</span></span>{lead.id === selectedLeadId ? <Check size={14} className="shrink-0 text-emerald-700" /> : null}</button>) : <p className="px-2.5 py-3 text-[11px] font-semibold text-[var(--muted)]">No encontramos un cliente con ese nombre o número.</p>}
          </div> : null}
        </div>
        <label className="block text-xs font-black text-[var(--ink)]">Modelo
          <select value={selectedModelId} onChange={(event) => { setSelectedModelId(event.target.value); setGenerated(null); }} disabled={!selectedLead} className="field-input mt-1.5 disabled:cursor-not-allowed disabled:opacity-55">
            <option value="">{selectedLead ? "Selecciona un modelo" : "Primero selecciona un cliente"}</option>
            {catalogModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
      </div>

      {selectedLead && catalogModels.length === 0 ? <p className="mt-2 text-[11px] font-semibold text-[#8a5b00]">No hay modelos activos disponibles para crear el documento.</p> : null}
      {generationError || sendError ? <p className="mt-3 rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]" role="alert">{generationError || sendError}</p> : null}
      {sendInfo ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800" role="status">{sendInfo}</p> : null}

      <div className="mt-4 flex flex-col gap-2 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] text-[var(--muted)]">{quoteMode === "CARD" && cardQuote ? <span>{formatCardCurrency(cardQuote.amount)} · {cardQuote.term} meses · {formatCardCurrency(cardQuote.installment)}/mes</span> : quoteMode === "NOVACREDIT" && novaQuote ? <span>{formatCardCurrency(novaQuote.totalVehicleValue)} · {novaQuote.term} meses · {formatCardCurrency(novaQuote.monthlyInstallment)}/mes</span> : <span>{validation.valid ? "Completa la cotización." : validation.message}</span>}</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void generatePdf()} disabled={isGenerating || isPreparingSend || isSending || !quote || !selectedLead || !selectedModel} className="button-secondary min-h-10 justify-center px-4 text-xs disabled:cursor-not-allowed disabled:opacity-55">
            {isGenerating ? <LoaderCircle size={15} className="animate-spin" /> : <FileText size={15} />}
            {isGenerating ? "Generando…" : "Generar PDF"}
          </button>
          <button type="button" onClick={() => void sendQuote()} disabled={isGenerating || isPreparingSend || isSending || !quote || !selectedLead || !selectedModel} className="button-primary min-h-10 justify-center px-4 text-xs disabled:cursor-not-allowed disabled:opacity-55">
            {isPreparingSend || isSending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
            {isPreparingSend ? "Preparando…" : isSending ? "Enviando…" : "Enviar cotización"}
          </button>
        </div>
      </div>

      {generated ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3" aria-live="polite">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-emerald-900">Cotización generada</p><p className="mt-1 text-[11px] text-emerald-800">{generated.modelName} · {formatGeneratedDate(generated.generatedAt)}</p></div><Check size={17} className="mt-0.5 shrink-0 text-emerald-700" /></div>
        {!generatedIsCurrent ? <p className="mt-2 text-[11px] font-semibold leading-4 text-[#8a5b00]">Cambiaste la cotización. Se generará un PDF actualizado cuando corresponda.</p> : null}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewFile(generated)} className="button-secondary min-h-9 px-3 py-1.5 text-[11px]"><ExternalLink size={14} />Ver PDF</button><a href={quoteFileUrl(generated.id, true)} className="button-secondary min-h-9 px-3 py-1.5 text-[11px]"><Download size={14} />Descargar</a></div>
        {generated.sendStatus === "ACCEPTED" ? <p className="mt-2 text-[11px] font-semibold text-emerald-800">Enviada por WhatsApp.</p> : null}
      </div> : null}
    </section>

    {selectedLead ? <section className="rounded-[22px] border border-black/[0.08] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,40,0.06)] sm:p-5" aria-labelledby="quote-history-title">
      <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Histórico</p><h2 id="quote-history-title" className="mt-1 text-lg font-black">Cotizaciones anteriores</h2></div>{isLoadingHistory ? <LoaderCircle size={17} className="animate-spin text-[var(--muted)]" /> : null}</div>
      {historyError ? <p className="mt-3 text-xs font-semibold text-[#b33a2c]" role="alert">{historyError}</p> : null}
      {!isLoadingHistory && !historyError && history.length === 0 ? <p className="mt-3 text-xs text-[var(--muted)]">Todavía no hay PDFs generados para este cliente.</p> : null}
      {history.length > 0 ? <div className="mt-3 divide-y divide-black/[0.06]">{history.map((file) => <div key={file.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-black text-[var(--ink)]">{file.modelName}</p><p className="mt-1 text-[11px] text-[var(--muted)]">{file.quoteType === "NOVACREDIT" ? "Crédito vehicular" : "Tarjeta de crédito"} · {formatGeneratedDate(file.generatedAt)} · {formatCardCurrency(file.amount)} · {file.term} meses</p>{file.sendStatus === "ACCEPTED" ? <p className="mt-1 text-[10px] font-semibold text-emerald-700">{file.quoteType === "NOVACREDIT" ? "Preparada en modo local" : "Enviada por WhatsApp"}</p> : file.sendStatus === "UNKNOWN" ? <p className="mt-1 text-[10px] font-semibold text-[#8a5b00]">Envío por confirmar</p> : null}</div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => setPreviewFile(file)} className="button-secondary min-h-8 px-2.5 py-1 text-[10px]"><ExternalLink size={13} />Ver PDF</button><a href={quoteFileUrl(file.id, true)} className="button-secondary min-h-8 px-2.5 py-1 text-[10px]" aria-label={`Descargar cotización de ${file.modelName}`}><Download size={13} />Descargar</a></div></div>)}</div> : null}
    </section> : null}

    {pendingNovaSend && pendingNovaSnapshot ? <div role="presentation" onClick={() => setPendingNovaSend(null)} className="fixed inset-0 z-[80] grid place-items-center bg-[#101828]/70 p-3 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="nova-send-confirm-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.28)]"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Preparación local</p><h2 id="nova-send-confirm-title" className="mt-1 text-lg font-black">Enviar cotización</h2></div><button type="button" onClick={() => setPendingNovaSend(null)} className="grid size-8 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]" aria-label="Cancelar preparación"><X size={17} /></button></div><div className="mt-4 space-y-2 rounded-xl bg-[#f8fbff] p-3 text-xs"><p><span className="font-semibold text-[var(--muted)]">Cliente:</span> <span className="font-black text-[var(--ink)]">{pendingNovaSend.clientName}</span></p><p><span className="font-semibold text-[var(--muted)]">Teléfono:</span> <span className="font-black text-[var(--ink)]">{pendingNovaSend.clientPhone}</span></p><p><span className="font-semibold text-[var(--muted)]">Modelo:</span> <span className="font-black text-[var(--ink)]">{pendingNovaSend.modelName}</span></p><div className="border-t border-black/[0.06] pt-2"><p className="font-black text-[var(--ink)]">Resumen</p><p className="mt-1 text-[var(--muted)]">{formatCardCurrency(pendingNovaSnapshot.totalVehicleValue)} · {pendingNovaSnapshot.termMonths} meses · {formatCardCurrency(pendingNovaSnapshot.monthlyInstallment)}/mes</p></div></div>{sendError ? <p className="mt-3 rounded-xl bg-[#fff0ee] px-3 py-2.5 text-xs font-semibold text-[#b33a2c]" role="alert">{sendError}</p> : null}<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPreviewFile(pendingNovaSend.quoteFile)} className="button-secondary min-h-10 justify-center px-4 text-xs"><ExternalLink size={15} />Ver PDF que se enviará</button><button type="button" onClick={() => void confirmNovaCreditSend()} disabled={isSending} className="button-primary min-h-10 justify-center px-4 text-xs disabled:cursor-not-allowed disabled:opacity-55">{isSending ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}{isSending ? "Preparando…" : "Confirmar"}</button></div></div></div> : null}

    {previewFile ? <div role="presentation" onClick={() => setPreviewFile(null)} className="fixed inset-0 z-[90] grid place-items-center bg-[#101828]/70 p-2 backdrop-blur-sm sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="quote-preview-title" onClick={(event) => event.stopPropagation()} className="relative flex h-[96vh] w-full min-w-0 max-w-4xl flex-col rounded-[24px] bg-white p-3 shadow-[0_24px_80px_rgba(16,24,40,0.28)] sm:h-[92vh] sm:p-5"><div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-3"><div className="min-w-0"><p className="eyebrow">Cotización</p><h2 id="quote-preview-title" className="truncate text-sm font-black">{previewFile.modelName}</h2></div><div className="flex shrink-0 items-center gap-2"><a href={quoteFileUrl(previewFile.id, true)} className="grid size-8 place-items-center rounded-lg bg-[#f6f3ed] text-[var(--ink)]" aria-label="Descargar cotización" title="Descargar"><Download size={15} /></a><button type="button" onClick={() => setPreviewFile(null)} className="grid size-8 place-items-center rounded-full bg-[#f6f3ed] text-[var(--ink)]" aria-label="Cerrar PDF"><X size={17} /></button></div></div><PdfViewer url={quoteFileUrl(previewFile.id)} title={`Cotización de ${previewFile.modelName}`} /></div></div> : null}
  </div>;
}
