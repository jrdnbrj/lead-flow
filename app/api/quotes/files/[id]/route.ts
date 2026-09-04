import { requireAdvisor } from "@/lib/auth/advisor";
import { downloadQuotePdf, getQuoteFileForAdvisor } from "@/lib/quotes/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(fileName: string, disposition: "inline" | "attachment"): string {
  const safeName = fileName.replace(/[\r\n"\\]/gu, "_").trim() || "cotizacion.pdf";
  const asciiName = safeName.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").replace(/[^\x20-\x7E]/gu, "_");
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const quoteFile = await getQuoteFileForAdvisor(authorization.advisorUserId, id);
  if (!quoteFile) return Response.json({ error: "QUOTE_FILE_NOT_FOUND" }, { status: 404 });

  const blob = await downloadQuotePdf(quoteFile.storage_path);
  if (!blob) return Response.json({ error: "QUOTE_FILE_UNAVAILABLE" }, { status: 404 });
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(blob, {
    status: 200,
    headers: {
      "content-type": quoteFile.mime_type,
      "content-length": String(blob.size),
      "content-disposition": contentDisposition(quoteFile.file_name, disposition),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
