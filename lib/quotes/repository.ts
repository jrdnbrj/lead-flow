import "server-only";

import type { Database, Json } from "@/lib/supabase/database";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GeneratedQuoteFile, QuoteCatalogModel, QuoteFileSendClaim, QuoteFileSendStatus, QuoteFileSummary, QuoteLeadOption, QuoteSnapshot } from "@/lib/quotes/types";

type QuoteFileRow = Database["public"]["Tables"]["quote_files"]["Row"];
type QuoteFileSendRow = Database["public"]["Tables"]["quote_file_sends"]["Row"];
type QuoteFileSendHistoryRow = Pick<QuoteFileSendRow, "quote_file_id" | "status" | "completed_at" | "created_at">;
type LeadOptionRow = { id: string; full_name: string; phone: string; car_model: string; car_models: string[] | null };
type CatalogModelRow = { id: string; name: string };
export type QuoteCatalogModelWithPhoto = QuoteCatalogModel & { photoStoragePath: string | null; photoMimeType: string | null };

function getAdminClient() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("QUOTE_CONFIGURATION_MISSING");
  return supabase;
}

function getLeadModelNames(row: LeadOptionRow): string[] {
  const values = Array.isArray(row.car_models) && row.car_models.length > 0 ? row.car_models : row.car_model.split(",");
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toQuoteFileSendStatus(value: string | null): QuoteFileSendStatus | null {
  return value === "CLAIMED" || value === "ACCEPTED" || value === "FAILED" || value === "UNKNOWN" ? value : null;
}

function snapshotToSummary(row: QuoteFileRow, send?: QuoteFileSendHistoryRow | null): QuoteFileSummary {
  const snapshot = row.snapshot as QuoteSnapshot;
  return {
    id: row.id,
    fileName: row.file_name,
    quoteType: "TARJETA_CREDITO",
    modelName: row.model_name_snapshot,
    amount: snapshot.amount,
    modality: snapshot.modality,
    term: snapshot.term,
    generatedAt: row.generated_at,
    sendStatus: toQuoteFileSendStatus(send?.status ?? null),
    sentAt: send?.status === "ACCEPTED" ? send.completed_at : null,
  };
}

export function quoteFileToGeneratedFile(row: QuoteFileRow): GeneratedQuoteFile {
  return { ...snapshotToSummary(row), snapshot: row.snapshot as QuoteSnapshot };
}

function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function parseQuoteFileSendClaim(value: unknown): QuoteFileSendClaim | null {
  const record = asJsonRecord(value);
  const claimAction = record?.claim_action;
  const status = record?.status;
  if (typeof record?.send_id !== "string" || typeof record?.attempt_no !== "number" || typeof status !== "string" || typeof claimAction !== "string") return null;
  if (!(["CLAIMED", "CLAIMED_RETRY", "REPLAYED", "BLOCKED_UNKNOWN", "IN_PROGRESS"] as string[]).includes(claimAction)) return null;
  const parsedStatus = toQuoteFileSendStatus(status);
  if (!parsedStatus) return null;
  return {
    sendId: record.send_id,
    attemptNo: record.attempt_no,
    status: parsedStatus,
    claimAction: claimAction as QuoteFileSendClaim["claimAction"],
    providerMessageId: typeof record.provider_message_id === "string" ? record.provider_message_id : null,
  };
}

export async function getQuoteLeadOptions(advisorUserId: string): Promise<{ leadOptions: QuoteLeadOption[]; catalogModels: QuoteCatalogModel[] }> {
  const supabase = getAdminClient();
  const [{ data: leads, error: leadsError }, { data: models, error: modelsError }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,full_name,phone,car_model,car_models")
      .eq("user_id", advisorUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("car_models")
      .select("id,name")
      .eq("active", true)
      .eq("is_other", false)
      .order("sort_order", { ascending: true }),
  ]);
  if (leadsError || modelsError) {
    console.error("[leadflow][quotes] lead/model options lookup failed", { leadsMessage: leadsError?.message ?? null, modelsMessage: modelsError?.message ?? null });
    throw new Error("QUOTE_CONTEXT_LOOKUP_FAILED");
  }

  const modelsByName = new Map((models as CatalogModelRow[] | null ?? []).map((model) => [model.name, model]));
  const leadOptions = (leads as LeadOptionRow[] | null ?? []).map((lead) => {
    const seen = new Set<string>();
    const leadModels = getLeadModelNames(lead)
      .map((name) => modelsByName.get(name))
      .filter((model): model is CatalogModelRow => Boolean(model))
      .filter((model) => {
        if (seen.has(model.id)) return false;
        seen.add(model.id);
        return true;
      });
    return { id: lead.id, fullName: lead.full_name, phone: lead.phone, models: leadModels };
  });
  return { leadOptions, catalogModels: models as CatalogModelRow[] | null ?? [] };
}

export async function getOwnedLeadForQuote(advisorUserId: string, leadId: string): Promise<LeadOptionRow | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id,full_name,phone,car_model,car_models")
    .eq("id", leadId)
    .eq("user_id", advisorUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[leadflow][quotes] lead lookup failed", { leadId, message: error.message });
    throw new Error("QUOTE_LEAD_LOOKUP_FAILED");
  }
  return data as LeadOptionRow | null;
}

export async function getActiveCatalogModel(modelId: string): Promise<QuoteCatalogModelWithPhoto | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("car_models")
    .select("id,name")
    .eq("id", modelId)
    .eq("active", true)
    .eq("is_other", false)
    .maybeSingle();
  if (error) {
    console.error("[leadflow][quotes] model lookup failed", { modelId, message: error.message });
    throw new Error("QUOTE_MODEL_LOOKUP_FAILED");
  }
  const model = data as CatalogModelRow | null;
  if (!model) return null;

  const { data: colors, error: colorsError } = await supabase
    .from("car_model_colors")
    .select("id,is_default,sort_order")
    .eq("car_model_id", model.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const colorIds = (colors ?? []).map((color) => color.id);
  if (!colorsError && colorIds.length > 0) {
    const { data: colorAssets, error: colorAssetsError } = await supabase
      .from("car_model_color_assets")
      .select("car_model_color_id,storage_path,mime_type,sort_order")
      .eq("asset_kind", "PHOTO")
      .eq("active", true)
      .in("car_model_color_id", colorIds)
      .order("sort_order", { ascending: true });
    if (!colorAssetsError) {
      const defaultColorIds = new Set((colors ?? []).filter((color) => color.is_default).map((color) => color.id));
      const orderedAssets = [...(colorAssets ?? [])].sort((left, right) => Number(defaultColorIds.has(right.car_model_color_id)) - Number(defaultColorIds.has(left.car_model_color_id)) || left.sort_order - right.sort_order);
      const asset = orderedAssets[0];
      if (asset) return { ...model, photoStoragePath: asset.storage_path, photoMimeType: asset.mime_type };
    }
  }

  const { data: legacyAsset } = await supabase
    .from("car_model_assets")
    .select("storage_path,mime_type")
    .eq("car_model_id", model.id)
    .eq("asset_kind", "PHOTO")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return { ...model, photoStoragePath: legacyAsset?.storage_path ?? null, photoMimeType: legacyAsset?.mime_type ?? null };
}

export async function downloadVehiclePhoto(storagePath: string): Promise<Uint8Array | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.storage.from("vehiculos").download(storagePath);
  if (error || !data) {
    console.error("[leadflow][quotes] vehicle photo download failed", { storagePath, message: error?.message ?? "NO_DATA" });
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function insertQuoteFile(input: {
  id: string;
  leadId: string;
  generatedBy: string;
  modelId: string;
  modelName: string;
  storagePath: string;
  fileName: string;
  snapshot: QuoteSnapshot;
}): Promise<QuoteFileRow> {
  const supabase = getAdminClient();
  const row: Database["public"]["Tables"]["quote_files"]["Insert"] = {
    id: input.id,
    lead_id: input.leadId,
    generated_by: input.generatedBy,
    quote_type: "TARJETA_CREDITO",
    model_id: input.modelId,
    model_name_snapshot: input.modelName,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: "application/pdf",
    snapshot: input.snapshot as unknown as Json,
    rules_version: input.snapshot.rulesVersion,
  };
  const { data, error } = await supabase.from("quote_files").insert(row).select("*").single();
  if (error || !data) {
    console.error("[leadflow][quotes] metadata insert failed", { leadId: input.leadId, message: error?.message ?? "NO_DATA" });
    throw new Error("QUOTE_METADATA_INSERT_FAILED");
  }
  return data;
}

export async function uploadQuotePdf(storagePath: string, bytes: Uint8Array): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.storage.from("quotations").upload(storagePath, Buffer.from(bytes), { contentType: "application/pdf", upsert: false });
  if (error) {
    console.error("[leadflow][quotes] PDF upload failed", { storagePath, message: error.message });
    throw new Error("QUOTE_STORAGE_UPLOAD_FAILED");
  }
}

export async function removeQuotePdf(storagePath: string): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await supabase.storage.from("quotations").remove([storagePath]);
  if (error) console.error("[leadflow][quotes] PDF cleanup failed", { storagePath, message: error.message });
}

export async function listQuoteFilesForLead(advisorUserId: string, leadId: string): Promise<QuoteFileSummary[]> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("quote_files")
    .select("*")
    .eq("generated_by", advisorUserId)
    .eq("lead_id", leadId)
    .order("generated_at", { ascending: false });
  if (error) {
    console.error("[leadflow][quotes] history lookup failed", { leadId, message: error.message });
    throw new Error("QUOTE_HISTORY_LOOKUP_FAILED");
  }
  const files = data as QuoteFileRow[] | null ?? [];
  if (files.length === 0) return [];
  const { data: sends, error: sendsError } = await supabase
    .from("quote_file_sends")
    .select("quote_file_id,status,completed_at,created_at")
    .in("quote_file_id", files.map((file) => file.id))
    .order("created_at", { ascending: false });
  if (sendsError) {
    console.error("[leadflow][quotes] send history lookup failed", { leadId, message: sendsError.message });
  }
  const latestSendByFile = new Map<string, QuoteFileSendHistoryRow>();
  (sends as QuoteFileSendHistoryRow[] | null ?? []).forEach((send) => {
    if (!latestSendByFile.has(send.quote_file_id)) latestSendByFile.set(send.quote_file_id, send);
  });
  return files.map((file) => snapshotToSummary(file, latestSendByFile.get(file.id) ?? null));
}

export async function getQuoteFileForAdvisor(advisorUserId: string, quoteFileId: string): Promise<QuoteFileRow | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("quote_files")
    .select("*")
    .eq("id", quoteFileId)
    .eq("generated_by", advisorUserId)
    .maybeSingle();
  if (error) {
    console.error("[leadflow][quotes] file lookup failed", { quoteFileId, message: error.message });
    throw new Error("QUOTE_FILE_LOOKUP_FAILED");
  }
  return data as QuoteFileRow | null;
}

export async function downloadQuotePdf(storagePath: string): Promise<Blob | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.storage.from("quotations").download(storagePath);
  if (error || !data) {
    console.error("[leadflow][quotes] PDF download failed", { storagePath, message: error?.message ?? "NO_DATA" });
    return null;
  }
  return data;
}

export async function createQuotePdfSignedUrl(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.storage.from("quotations").createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.error("[leadflow][quotes] signed PDF URL creation failed", { message: error?.message ?? "NO_URL" });
    return null;
  }
  return data.signedUrl;
}

export async function claimQuoteFileSend(input: {
  quoteFileId: string;
  leadId: string;
  generatedBy: string;
  recipientPhone: string;
  evolutionInstance: string;
  idempotencyKey: string;
  claimTokenDigest: string;
}): Promise<QuoteFileSendClaim | null> {
  const supabase = getAdminClient();
  const { data, error } = await supabase.rpc("claim_quote_file_send_v1", {
    p_quote_file_id: input.quoteFileId,
    p_lead_id: input.leadId,
    p_generated_by: input.generatedBy,
    p_recipient_phone: input.recipientPhone,
    p_evolution_instance: input.evolutionInstance,
    p_idempotency_key: input.idempotencyKey,
    p_claim_token_digest: input.claimTokenDigest,
  });
  if (error) {
    console.error("[leadflow][quotes] send claim failed", { quoteFileId: input.quoteFileId, message: error.message });
    return null;
  }
  return parseQuoteFileSendClaim(data);
}

export async function beginQuoteFileSendIo(input: { sendId: string; attemptNo: number; claimTokenDigest: string }): Promise<boolean> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc("begin_quote_file_send_io_v1", {
    p_send_id: input.sendId,
    p_attempt_no: input.attemptNo,
    p_claim_token_digest: input.claimTokenDigest,
  });
  if (error) {
    console.error("[leadflow][quotes] send IO fence failed", { sendId: input.sendId, message: error.message });
    return false;
  }
  return true;
}

export async function recordQuoteFileSendResult(input: {
  sendId: string;
  attemptNo: number;
  claimTokenDigest: string;
  resultKind: QuoteFileSendStatus;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultPayload?: Record<string, unknown> | null;
}): Promise<boolean> {
  const supabase = getAdminClient();
  const { error } = await supabase.rpc("record_quote_file_send_result_v1", {
    p_send_id: input.sendId,
    p_attempt_no: input.attemptNo,
    p_claim_token_digest: input.claimTokenDigest,
    p_result_kind: input.resultKind,
    p_provider_message_id: input.providerMessageId ?? null,
    p_provider_status: input.providerStatus ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_result_payload: input.resultPayload as unknown as Json | null,
  });
  if (error) {
    console.error("[leadflow][quotes] send result recording failed", { sendId: input.sendId, resultKind: input.resultKind, message: error.message });
    return false;
  }
  return true;
}
