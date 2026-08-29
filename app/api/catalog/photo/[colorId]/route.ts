import { requireAdvisor } from "@/lib/auth/advisor";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDispositionFileName(fileName: string): string {
  const safeName = fileName.replace(/[\r\n"\\]/g, "_").trim() || "foto-vehiculo.jpg";
  const asciiName = safeName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function presentModelName(modelId: string, name: string): string {
  if (modelId === "deepal-s05-max-hibrido") return "Deepal S05 Max";
  if (modelId === "m60") return "M60";
  return name;
}

function presentColorName(slug: string, name: string): string {
  if (slug === "plomo") return "Gris";
  if (slug === "plomo-plateado") return "Gris plateado";
  return name;
}

export async function GET(_request: Request, { params }: { params: Promise<{ colorId: string }> }) {
  const authorization = await requireAdvisor();
  if (authorization.status !== "AUTHORIZED") return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { colorId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return Response.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });

  const [{ data: color }, { data: asset }] = await Promise.all([
    supabase.from("car_model_colors").select("id,car_model_id,name,slug").eq("id", colorId).eq("active", true).maybeSingle(),
    supabase.from("car_model_color_assets").select("car_model_color_id,storage_path,file_name,mime_type").eq("car_model_color_id", colorId).eq("asset_kind", "PHOTO").eq("active", true).maybeSingle(),
  ]);
  if (!color || !asset) return Response.json({ error: "PHOTO_NOT_FOUND" }, { status: 404 });

  const { data: model } = await supabase.from("car_models").select("id,name").eq("id", color.car_model_id).eq("active", true).eq("is_other", false).maybeSingle();
  if (!model) return Response.json({ error: "MODEL_NOT_FOUND" }, { status: 404 });

  const { data: publicAsset } = supabase.storage.from("vehiculos").getPublicUrl(asset.storage_path);
  const upstream = await fetch(publicAsset.publicUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) return Response.json({ error: "PHOTO_UNAVAILABLE" }, { status: 502 });

  const displayName = presentModelName(model.id, model.name);
  const displayColor = presentColorName(color.slug, color.name);
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": asset.mime_type || "image/jpeg",
      "content-disposition": contentDispositionFileName(`${displayName} - ${displayColor}.jpg`),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
