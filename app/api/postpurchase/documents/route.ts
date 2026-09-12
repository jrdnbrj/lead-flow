import { requireAdvisor } from "@/lib/auth/advisor";
import { validatePurchaseCaseDocumentFile, PURCHASE_CASE_DOCUMENT_MAX_BYTES } from "@/lib/postpurchase-documents/file-validation";
import { createOrReplacePurchaseCaseDocument, listActivePurchaseCaseDocuments, removePurchaseCaseDocumentObject, uploadPurchaseCaseDocumentObject } from "@/lib/postpurchase-documents/repository";
import { purchaseCaseDocumentLabels, purchaseCaseDocumentMimeTypes, purchaseCaseDocumentTypes, type PurchaseCaseDocumentType } from "@/lib/postpurchase-documents/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isDocumentType(value: FormDataEntryValue | null): value is PurchaseCaseDocumentType {
  return typeof value === "string" && (purchaseCaseDocumentTypes as readonly string[]).includes(value);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DOCUMENT_REPLACEMENT_REQUIRED")) return "Este tipo de documento ya existe. Selecciona el archivo actual para reemplazarlo.";
  if (message.includes("DOCUMENT_REPLACEMENT_INVALID")) return "El documento que intentas reemplazar ya cambió. Actualiza la lista e inténtalo de nuevo.";
  if (message.includes("PURCHASE_NOT_ACTIVE")) return "Los documentos sólo se pueden agregar mientras Postcompra está activa.";
  if (message.includes("DOCUMENT_MIME_INVALID") || message.includes("DOCUMENT_PATH_INVALID")) return "El archivo no es válido para este documento.";
  if (message.includes("DOCUMENT_SIZE_INVALID")) return "El archivo debe pesar menos de 10 MB.";
  return "No pudimos guardar el documento. Puedes reintentarlo.";
}

export async function GET(request: Request) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const purchaseCaseId = new URL(request.url).searchParams.get("purchaseCaseId");
  if (!purchaseCaseId || !UUID_RE.test(purchaseCaseId)) return Response.json({ error: "PURCHASE_CASE_REQUIRED" }, { status: 400 });

  try {
    const documents = await listActivePurchaseCaseDocuments(authorization.advisorUserId, purchaseCaseId);
    return Response.json({ documents }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[leadflow][postpurchase-documents] list route failed", { message: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
    return Response.json({ error: "DOCUMENTS_LOOKUP_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const formData = await request.formData();
  const purchaseCaseId = formData.get("purchaseCaseId");
  const documentType = formData.get("documentType");
  const replaceDocumentId = formData.get("replaceDocumentId");
  const file = formData.get("file");
  if (typeof purchaseCaseId !== "string" || !UUID_RE.test(purchaseCaseId) || !isDocumentType(documentType) || !(file instanceof File)) {
    return Response.json({ error: "DOCUMENT_INPUT_INVALID" }, { status: 400 });
  }
  if (replaceDocumentId !== null && (typeof replaceDocumentId !== "string" || !UUID_RE.test(replaceDocumentId))) {
    return Response.json({ error: "DOCUMENT_REPLACEMENT_INVALID" }, { status: 400 });
  }
  if (file.size < 1 || file.size > PURCHASE_CASE_DOCUMENT_MAX_BYTES) return Response.json({ error: "DOCUMENT_SIZE_INVALID" }, { status: 400 });
  if (!purchaseCaseDocumentMimeTypes.includes(file.type as (typeof purchaseCaseDocumentMimeTypes)[number])) return Response.json({ error: "DOCUMENT_MIME_INVALID" }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validatePurchaseCaseDocumentFile({ declaredMimeType: file.type, sizeBytes: file.size, bytes });
  if (!validated) return Response.json({ error: "DOCUMENT_FILE_INVALID" }, { status: 400 });

  const documentId = crypto.randomUUID();
  const storagePath = `purchase-cases/${purchaseCaseId}/${documentId}.${validated.extension}`;
  try {
    await uploadPurchaseCaseDocumentObject(storagePath, bytes, validated.mimeType);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      await removePurchaseCaseDocumentObject(storagePath);
      return Response.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });
    }
    const document = await createOrReplacePurchaseCaseDocument(supabase, {
      documentId,
      purchaseCaseId,
      documentType,
      storagePath,
      originalFilename: file.name || purchaseCaseDocumentLabels[documentType],
      mimeType: validated.mimeType,
      sizeBytes: file.size,
      replaceDocumentId: replaceDocumentId as string | null,
    });
    return Response.json({ document: { id: document.id, documentType: document.documentType, status: document.status, originalFilename: document.originalFilename, mimeType: document.mimeType, sizeBytes: document.sizeBytes, createdAt: document.createdAt } }, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    await removePurchaseCaseDocumentObject(storagePath);
    console.error("[leadflow][postpurchase-documents] upload route failed", { documentType, message: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }
}
