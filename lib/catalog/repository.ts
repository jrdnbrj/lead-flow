import type { Database } from "@/lib/supabase/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CatalogColor = Pick<Database["public"]["Tables"]["car_model_colors"]["Row"], "id" | "name" | "slug" | "sort_order">;

export type CatalogModel = {
  id: string;
  name: string;
  sortOrder: number;
  imageUrl: string | null;
  imageAlt: string;
  imageFileName: string | null;
  technicalSheetUrl: string | null;
  technicalSheetFileName: string | null;
  colors: CatalogColor[];
};

type CatalogAsset = Pick<Database["public"]["Tables"]["car_model_assets"]["Row"], "car_model_id" | "asset_kind" | "storage_path" | "file_name" | "sort_order">;
type LegacyCatalogImage = Pick<Database["public"]["Tables"]["car_model_images"]["Row"], "car_model_id" | "image_url" | "alt_text" | "sort_order">;

function publicVehicleUrl(storagePath: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/storage/v1/object/public/vehiculos/${storagePath}` : null;
}

export async function getCatalogModels(): Promise<CatalogModel[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data: models, error } = await supabase
    .from("car_models")
    .select("id,name,sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !models?.length) return [];

  const modelIds = models.map((model) => model.id);
  const [{ data: assets }, { data: legacyImages }, { data: colors }] = await Promise.all([
    supabase.from("car_model_assets").select("car_model_id,asset_kind,storage_path,file_name,sort_order").eq("active", true).in("car_model_id", modelIds).order("sort_order", { ascending: true }),
    supabase.from("car_model_images").select("car_model_id,image_url,alt_text,sort_order").in("car_model_id", modelIds).order("sort_order", { ascending: true }),
    supabase.from("car_model_colors").select("id,car_model_id,name,slug,sort_order").eq("active", true).in("car_model_id", modelIds).order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);

  const assetsByModel = new Map<string, CatalogAsset[]>();
  (assets ?? []).forEach((asset) => assetsByModel.set(asset.car_model_id, [...(assetsByModel.get(asset.car_model_id) ?? []), asset]));
  const legacyByModel = new Map<string, LegacyCatalogImage>();
  (legacyImages ?? []).forEach((image) => { if (!legacyByModel.has(image.car_model_id)) legacyByModel.set(image.car_model_id, image); });
  const colorsByModel = new Map<string, CatalogColor[]>();
  (colors ?? []).forEach((color) => colorsByModel.set(color.car_model_id, [...(colorsByModel.get(color.car_model_id) ?? []), color]));

  return models.map((model) => {
    const modelAssets = assetsByModel.get(model.id) ?? [];
    const photo = modelAssets.find((asset) => asset.asset_kind === "PHOTO");
    const sheet = modelAssets.find((asset) => asset.asset_kind === "TECHNICAL_SHEET");
    const legacyImage = modelAssets.length === 0 ? legacyByModel.get(model.id) : undefined;
    return {
      id: model.id,
      name: model.name,
      sortOrder: model.sort_order,
      imageUrl: photo ? publicVehicleUrl(photo.storage_path) : legacyImage?.image_url ?? null,
      imageAlt: legacyImage?.alt_text ?? photo?.file_name ?? `Foto de ${model.name}`,
      imageFileName: photo?.file_name ?? null,
      technicalSheetUrl: sheet ? publicVehicleUrl(sheet.storage_path) : null,
      technicalSheetFileName: sheet?.file_name ?? null,
      colors: colorsByModel.get(model.id) ?? [],
    };
  });
}
