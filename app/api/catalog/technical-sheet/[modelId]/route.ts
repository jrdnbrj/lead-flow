import { requireAdvisor } from "@/lib/auth/advisor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDispositionFileName(fileName: string, disposition: "inline" | "attachment"): string {
  const safeName = fileName.replace(/[\r\n"\\]/g, "_").trim() || "ficha-tecnica.pdf";
  const asciiName = safeName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "_");
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { modelId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });

  const [{ data: model }, { data: asset }] = await Promise.all([
    supabase.from("car_models").select("id,name").eq("id", modelId).eq("active", true).eq("is_other", false).maybeSingle(),
    supabase.from("car_model_assets").select("storage_path,file_name,mime_type").eq("car_model_id", modelId).eq("asset_kind", "TECHNICAL_SHEET").eq("active", true).order("sort_order", { ascending: true }).limit(1).maybeSingle(),
  ]);
  if (!model || !asset) return Response.json({ error: "TECHNICAL_SHEET_NOT_FOUND" }, { status: 404 });

  const { data: publicAsset } = supabase.storage.from("vehiculos").getPublicUrl(asset.storage_path);
  const upstream = await fetch(publicAsset.publicUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return Response.json({ error: "TECHNICAL_SHEET_UNAVAILABLE" }, { status: 502 });
  const displayName = model.id === "deepal-s05-max-hibrido" ? "Deepal S05 Max" : model.id === "m60" ? "M60" : model.name;
  const displayFileName = `${displayName} - Ficha técnica.pdf`;
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": asset.mime_type || "application/pdf",
      "content-disposition": contentDispositionFileName(displayFileName, disposition),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
