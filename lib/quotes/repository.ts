import "server-only";

import type { Database, Json } from "@/lib/supabase/database";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QuoteFileSummary, QuoteLeadOption, QuoteSnapshot } from "@/lib/quotes/types";

type QuoteFileRow = Database["public"]["Tables"]["quote_files"]["Row"];
type LeadOptionRow = { id: string; full_name: string; phone: string; car_model: string; car_models: string[] | null };
type CatalogModelRow = { id: string; name: string };

function getAdminClient() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("QUOTE_CONFIGURATION_MISSING");
  return supabase;
}

function getLeadModelNames(row: LeadOptionRow): string[] {
  const values = Array.isArray(row.car_models) && row.car_models.length > 0 ? row.car_models : row.car_model.split(",");
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function snapshotToSummary(row: QuoteFileRow): QuoteFileSummary {
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
  };
}

export async function getQuoteLeadOptions(advisorUserId: string): Promise<QuoteLeadOption[]> {
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
  return (leads as LeadOptionRow[] | null ?? []).map((lead) => {
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

export async function getActiveCatalogModel(modelId: string): Promise<CatalogModelRow | null> {
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
  return data as CatalogModelRow | null;
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
  return (data as QuoteFileRow[] | null ?? []).map(snapshotToSummary);
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
