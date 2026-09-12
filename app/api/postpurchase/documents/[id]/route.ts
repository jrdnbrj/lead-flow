import { requireAdvisor } from "@/lib/auth/advisor";
import { deletePurchaseCaseDocument } from "@/lib/postpurchase-documents/repository";
import { createPurchaseCaseDocumentSignedUrl } from "@/lib/postpurchase-documents/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  try {
    const document = await createPurchaseCaseDocumentSignedUrl(authorization.advisorUserId, id);
    if (!document) return Response.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
    return Response.json(document, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[leadflow][postpurchase-documents] access route failed", { documentId: id, message: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
    return Response.json({ error: "DOCUMENT_UNAVAILABLE" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return Response.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });
    await deletePurchaseCaseDocument(supabase, id);
    return Response.json({ deleted: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[leadflow][postpurchase-documents] delete route failed", { documentId: id, message: error instanceof Error ? error.message : "UNKNOWN_ERROR" });
    return Response.json({ error: "DOCUMENT_DELETE_FAILED" }, { status: 400 });
  }
}
