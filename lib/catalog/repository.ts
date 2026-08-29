import type { Database } from "@/lib/supabase/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CatalogColor = Pick<Database["public"]["Tables"]["car_model_colors"]["Row"], "id" | "name" | "slug" | "sort_order"> & { imageUrl?: string | null };

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

type CatalogColorAsset = Pick<Database["public"]["Tables"]["car_model_color_assets"]["Row"], "car_model_color_id" | "asset_kind" | "storage_path" | "file_name" | "sort_order">;
type CatalogAsset = Pick<Database["public"]["Tables"]["car_model_assets"]["Row"], "car_model_id" | "asset_kind" | "storage_path" | "file_name" | "sort_order">;

function presentCatalogColor(color: CatalogColor): CatalogColor {
  if (color.slug === "plomo") return { ...color, name: "Gris", slug: "gris" };
  if (color.slug === "plomo-plateado") return { ...color, name: "Gris plateado", slug: "gris-plateado" };
  return color;
}

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
    .eq("is_other", false)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !models?.length) return [];

  const modelIds = models.map((model) => model.id);
  const [{ data: assets }, { data: colors }, { data: colorAssets }] = await Promise.all([
    supabase.from("car_model_assets").select("car_model_id,asset_kind,storage_path,file_name,sort_order").eq("active", true).eq("asset_kind", "TECHNICAL_SHEET").in("car_model_id", modelIds).order("sort_order", { ascending: true }),
    supabase.from("car_model_colors").select("id,car_model_id,name,slug,sort_order").eq("active", true).in("car_model_id", modelIds).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("car_model_color_assets").select("car_model_color_id,asset_kind,storage_path,file_name,sort_order").eq("active", true).eq("asset_kind", "PHOTO").order("sort_order", { ascending: true }),
  ]);

  const sheetByModel = new Map<string, CatalogAsset>();
  (assets ?? []).forEach((asset) => { if (!sheetByModel.has(asset.car_model_id)) sheetByModel.set(asset.car_model_id, asset); });
  const colorAssetByColor = new Map<string, CatalogColorAsset>();
  (colorAssets ?? []).forEach((asset) => { if (!colorAssetByColor.has(asset.car_model_color_id)) colorAssetByColor.set(asset.car_model_color_id, asset); });
  const colorsByModel = new Map<string, CatalogColor[]>();
  (colors ?? []).forEach((color) => {
    const presentedColor = presentCatalogColor(color);
    const colorAsset = colorAssetByColor.get(color.id);
    colorsByModel.set(color.car_model_id, [...(colorsByModel.get(color.car_model_id) ?? []), {
      ...presentedColor,
      imageUrl: colorAsset ? publicVehicleUrl(colorAsset.storage_path) : null,
    }]);
  });

  return models.map((model) => {
    const modelColors = colorsByModel.get(model.id) ?? [];
    const firstColorWithPhoto = modelColors.find((color) => color.imageUrl);
    const sheet = sheetByModel.get(model.id);
    return {
      id: model.id,
      name: model.name,
      sortOrder: model.sort_order,
      imageUrl: firstColorWithPhoto?.imageUrl ?? null,
      imageAlt: firstColorWithPhoto ? `${model.name} en color ${firstColorWithPhoto.name}` : `Foto de ${model.name}`,
      imageFileName: firstColorWithPhoto ? `${model.name} - ${firstColorWithPhoto.name}.jpg` : null,
      technicalSheetUrl: sheet ? publicVehicleUrl(sheet.storage_path) : null,
      technicalSheetFileName: sheet?.file_name ?? null,
      colors: modelColors,
    };
  });
}
