import type { Database } from "@/lib/supabase/database";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type CatalogColor = Pick<Database["public"]["Tables"]["car_model_colors"]["Row"], "id" | "name" | "slug" | "sort_order"> & { imageUrl?: string | null; imageFileName?: string | null };

export type CatalogModel = {
  id: string;
  name: string;
  sortOrder: number;
  leadRegistrationCount: number | null;
  imageUrl: string | null;
  imageAlt: string;
  imageFileName: string | null;
  technicalSheetUrl: string | null;
  technicalSheetViewerUrl: string;
  technicalSheetFileName: string | null;
  colors: CatalogColor[];
};

type CatalogColorAsset = Pick<Database["public"]["Tables"]["car_model_color_assets"]["Row"], "car_model_color_id" | "asset_kind" | "storage_path" | "file_name" | "sort_order">;
type CatalogAsset = Pick<Database["public"]["Tables"]["car_model_assets"]["Row"], "car_model_id" | "asset_kind" | "storage_path" | "file_name" | "sort_order">;
type CatalogModelRow = { id: string; name: string; sort_order: number; lead_registration_count?: number | null };

function titleCaseColorName(value: string): string {
  return value
    .toLocaleLowerCase("es-EC")
    .replace(/(^|[\s(\-/])([\p{L}])/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("es-EC")}`);
}

function presentCatalogColor(color: CatalogColor): CatalogColor {
  if (color.slug === "plomo") return { ...color, name: "Gris", slug: "gris" };
  if (color.slug === "plomo-plateado") return { ...color, name: "Gris Plateado", slug: "gris-plateado" };
  return { ...color, name: titleCaseColorName(color.name) };
}

function presentCatalogModelName(modelId: string, name: string): string {
  if (modelId === "deepal-s05-max-hibrido") return "Deepal S05 Max";
  if (modelId === "m60") return "M60";
  return name;
}

function publicVehicleUrl(storagePath: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/storage/v1/object/public/vehiculos/${storagePath}` : null;
}

export async function getCatalogModels(): Promise<CatalogModel[]> {
  // The route enforces advisor authentication before this repository is
  // called. Catalog metadata is not owner-scoped, so keep this read server-only
  // and independent from a browser session refresh; a stale session must not
  // render the protected catalog as an empty catalog.
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const modelQuery = () => supabase
    .from("car_models")
    .select("id,name,sort_order,lead_registration_count")
    .eq("active", true)
    .eq("is_other", false)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const modelResult = await modelQuery();
  let models: CatalogModelRow[] = (modelResult.data ?? []) as CatalogModelRow[];
  let error = modelResult.error;
  let metricAvailable = true;
  if (error && /lead_registration_count|column/i.test(error.message ?? "")) {
    metricAvailable = false;
    const fallback = await supabase
      .from("car_models")
      .select("id,name,sort_order")
      .eq("active", true)
      .eq("is_other", false)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    models = (fallback.data ?? []) as CatalogModelRow[];
    error = fallback.error;
  }
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
      imageFileName: colorAsset?.file_name ?? null,
    }]);
  });

  return models.map((model) => {
    const modelColors = colorsByModel.get(model.id) ?? [];
    const firstColorWithPhoto = modelColors.find((color) => color.imageUrl);
    const sheet = sheetByModel.get(model.id);
    const displayName = presentCatalogModelName(model.id, model.name);
    return {
      id: model.id,
      name: displayName,
      sortOrder: model.sort_order,
      leadRegistrationCount: metricAvailable && typeof model.lead_registration_count === "number" ? model.lead_registration_count : null,
      imageUrl: firstColorWithPhoto?.imageUrl ?? null,
      imageAlt: firstColorWithPhoto ? `${displayName} en color ${firstColorWithPhoto.name}` : `Foto de ${displayName}`,
      imageFileName: firstColorWithPhoto ? `${displayName} - ${firstColorWithPhoto.name}.jpg` : null,
      technicalSheetUrl: sheet ? publicVehicleUrl(sheet.storage_path) : null,
      technicalSheetViewerUrl: `/api/catalog/technical-sheet/${encodeURIComponent(model.id)}`,
      technicalSheetFileName: sheet?.file_name ?? null,
      colors: modelColors,
    };
  });
}
