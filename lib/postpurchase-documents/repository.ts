import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invokeAuthenticatedRpc } from "@/lib/supabase/authenticated-rpc";
import type { Database } from "@/lib/supabase/database";
import type { PurchaseCaseDocument, PurchaseCaseDocumentAccess, PurchaseCaseDocumentMimeType, PurchaseCaseDocumentStatus, PurchaseCaseDocumentType } from "@/lib/postpurchase-documents/types";

type DocumentRow = Database["public"]["Tables"]["purchase_case_documents"]["Row"];
type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

function getAdminClient() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("POSTPURCHASE_DOCUMENTS_CONFIGURATION_MISSING");
  return supabase;
}

function toDocument(row: DocumentRow): PurchaseCaseDocument {
  return {
    id: row.id,
    purchaseCaseId: row.purchase_case_id,
    documentType: row.document_type as PurchaseCaseDocumentType,
    status: row.status as PurchaseCaseDocumentStatus,
    originalFilename: row.original_filename,
    mimeType: row.mime_type as PurchaseCaseDocumentMimeType,
    sizeBytes: Number(row.size_bytes),
    replacedBy: row.replaced_by,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

async function getOwnedCaseRow(advisorUserId: string, purchaseCaseId: string) {
  const supabase = getAdminClient();
  const { data: caseRow, error: caseError } = await supabase
    .from("purchase_cases")
    .select("id,lead_id")
    .eq("id", purchaseCaseId)
    .maybeSingle();
  if (caseError) {
    console.error("[leadflow][postpurchase-documents] case lookup failed", { purchaseCaseId, message: caseError.message });
    throw new Error("PURCHASE_CASE_LOOKUP_FAILED");
  }
  if (!caseRow) return null;

  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", caseRow.lead_id)
    .eq("user_id", advisorUserId)
    .is("deleted_at", null)
    .maybeSingle();
  if (leadError) {
    console.error("[leadflow][postpurchase-documents] owner lookup failed", { purchaseCaseId, message: leadError.message });
    throw new Error("PURCHASE_CASE_OWNER_LOOKUP_FAILED");
  }
  return leadRow ? caseRow : null;
}

export async function listActivePurchaseCaseDocuments(advisorUserId: string, purchaseCaseId: string): Promise<PurchaseCaseDocumentAccess[]> {
  const ownedCase = await getOwnedCaseRow(advisorUserId, purchaseCaseId);
  if (!ownedCase) return [];
  const { data, error } = await getAdminClient()
    .from("purchase_case_documents")
    .select("id,purchase_case_id,document_type,status,original_filename,mime_type,size_bytes,replaced_by,deleted_at,deleted_by,created_at,created_by,updated_at")
    .eq("purchase_case_id", purchaseCaseId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[leadflow][postpurchase-documents] list failed", { purchaseCaseId, message: error.message });
    throw new Error("PURCHASE_CASE_DOCUMENTS_LOOKUP_FAILED");
  }
  return (data as DocumentRow[] | null ?? []).map(toDocument).map((document) => ({
    id: document.id,
    documentType: document.documentType,
    status: document.status,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    createdAt: document.createdAt,
  }));
}

async function getActiveDocumentForAdvisor(advisorUserId: string, documentId: string): Promise<DocumentRow | null> {
  const { data, error } = await getAdminClient()
    .from("purchase_case_documents")
    .select("*")
    .eq("id", documentId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (error) {
    console.error("[leadflow][postpurchase-documents] document lookup failed", { documentId, message: error.message });
    throw new Error("PURCHASE_CASE_DOCUMENT_LOOKUP_FAILED");
  }
  if (!data) return null;
  const ownedCase = await getOwnedCaseRow(advisorUserId, data.purchase_case_id);
  return ownedCase ? data as DocumentRow : null;
}

export async function createPurchaseCaseDocumentSignedUrl(advisorUserId: string, documentId: string): Promise<{ url: string; fileName: string; mimeType: string } | null> {
  const document = await getActiveDocumentForAdvisor(advisorUserId, documentId);
  if (!document) return null;
  const { data, error } = await getAdminClient().storage.from("purchase-documents").createSignedUrl(document.storage_path, 300);
  if (error || !data?.signedUrl) {
    console.error("[leadflow][postpurchase-documents] signed URL creation failed", { documentId, message: error?.message ?? "NO_URL" });
    throw new Error("PURCHASE_CASE_DOCUMENT_URL_FAILED");
  }
  return { url: data.signedUrl, fileName: document.original_filename, mimeType: document.mime_type };
}

export async function uploadPurchaseCaseDocumentObject(storagePath: string, bytes: Uint8Array, mimeType: PurchaseCaseDocumentMimeType): Promise<void> {
  const { error } = await getAdminClient().storage.from("purchase-documents").upload(storagePath, Buffer.from(bytes), { contentType: mimeType, upsert: false });
  if (error) {
    console.error("[leadflow][postpurchase-documents] object upload failed", { storagePath, message: error.message });
    throw new Error("PURCHASE_CASE_DOCUMENT_UPLOAD_FAILED");
  }
}

export async function removePurchaseCaseDocumentObject(storagePath: string): Promise<void> {
  const { error } = await getAdminClient().storage.from("purchase-documents").remove([storagePath]);
  if (error) console.error("[leadflow][postpurchase-documents] object cleanup failed", { storagePath, message: error.message });
}

function parseRpcDocument(value: unknown): PurchaseCaseDocument | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.purchase_case_id !== "string" || typeof raw.document_type !== "string" || typeof raw.status !== "string" || typeof raw.original_filename !== "string" || typeof raw.mime_type !== "string" || typeof raw.size_bytes !== "number" && typeof raw.size_bytes !== "string" || typeof raw.created_at !== "string" || typeof raw.created_by !== "string" || typeof raw.updated_at !== "string") return null;
  return {
    id: raw.id,
    purchaseCaseId: raw.purchase_case_id,
    documentType: raw.document_type as PurchaseCaseDocumentType,
    status: raw.status as PurchaseCaseDocumentStatus,
    originalFilename: raw.original_filename,
    mimeType: raw.mime_type as PurchaseCaseDocumentMimeType,
    sizeBytes: Number(raw.size_bytes),
    replacedBy: typeof raw.replaced_by === "string" ? raw.replaced_by : null,
    deletedAt: typeof raw.deleted_at === "string" ? raw.deleted_at : null,
    deletedBy: typeof raw.deleted_by === "string" ? raw.deleted_by : null,
    createdAt: raw.created_at,
    createdBy: raw.created_by,
    updatedAt: raw.updated_at,
  };
}

export async function createOrReplacePurchaseCaseDocument(client: Pick<SupabaseClient<Database>, "auth">, input: { documentId: string; purchaseCaseId: string; documentType: PurchaseCaseDocumentType; storagePath: string; originalFilename: string; mimeType: PurchaseCaseDocumentMimeType; sizeBytes: number; replaceDocumentId: string | null }): Promise<PurchaseCaseDocument> {
  const result = await invokeAuthenticatedRpc(client, "create_or_replace_purchase_case_document_v1", {
    p_document_id: input.documentId,
    p_purchase_case_id: input.purchaseCaseId,
    p_document_type: input.documentType,
    p_storage_path: input.storagePath,
    p_original_filename: input.originalFilename,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_replace_document_id: input.replaceDocumentId,
  });
  const document = parseRpcDocument(result.data);
  if (result.error || !document) {
    console.error("[leadflow][postpurchase-documents] metadata RPC failed", { message: result.error?.message ?? "INVALID_RESPONSE" });
    throw new Error(result.error?.message ?? "PURCHASE_CASE_DOCUMENT_METADATA_FAILED");
  }
  return document;
}

export async function deletePurchaseCaseDocument(client: Pick<SupabaseClient<Database>, "auth">, documentId: string): Promise<PurchaseCaseDocument> {
  const result = await invokeAuthenticatedRpc(client, "delete_purchase_case_document_v1", { p_document_id: documentId });
  const document = parseRpcDocument(result.data);
  if (result.error || !document) {
    console.error("[leadflow][postpurchase-documents] delete RPC failed", { documentId, message: result.error?.message ?? "INVALID_RESPONSE" });
    throw new Error(result.error?.message ?? "PURCHASE_CASE_DOCUMENT_DELETE_FAILED");
  }
  return document;
}

export type { ServerSupabaseClient };
