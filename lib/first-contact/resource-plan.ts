import type { FirstContactItem, FirstContactResourceSnapshot } from "@/lib/first-contact/types";

export type FirstContactColorSelection = { vehicleIndex: number; colorId: string | null };

export type FirstContactColorOption = {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  imageUrl: string | null;
  imageFileName: string | null;
};

export type FirstContactColorModelOption = {
  vehicleIndex: number;
  modelId: string | null;
  modelName: string;
  defaultImageUrl: string | null;
  defaultColorId: string | null;
  colors: FirstContactColorOption[];
};

export type FirstContactModelResources = {
  modelName: string;
  modelId: string | null;
  imageUrl: string | null;
  imageFileName: string | null;
  imageSource: "COLOR_PHOTO" | "DEFAULT_COLOR_PHOTO" | "MODEL_PHOTO" | "LEGACY_PHOTO" | "NONE";
  imageAssetId: string | null;
  imageStoragePath: string | null;
  selectedColorId: string | null;
  selectedColorName: string | null;
  technicalSheetUrl: string | null;
  technicalSheetFileName: string | null;
  technicalSheetAssetId: string | null;
  technicalSheetStoragePath: string | null;
};

export type FirstContactRequestItem = Pick<FirstContactItem, "resourceKind" | "itemKey" | "resourceVersion" | "availability"> & { resourceSnapshot?: FirstContactResourceSnapshot };

export function modelSlug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "modelo";
}

export function modelResourceItemKey(resource: "PHOTO" | "TECHNICAL_SHEET", index: number, model: FirstContactModelResources): string {
  return `${resource}:${String(index + 1).padStart(2, "0")}:${model.modelId ?? modelSlug(model.modelName)}`;
}

export function isModelScopedResourceKey(itemKey: string): boolean {
  return /^(PHOTO|TECHNICAL_SHEET):\d{2}:/.test(itemKey);
}

export function planFirstContactResourceItems(modelResources: FirstContactModelResources[]): {
  items: FirstContactRequestItem[];
  resourcesByItemKey: Record<string, FirstContactModelResources>;
} {
  const resourcesByItemKey: Record<string, FirstContactModelResources> = {};
  const items = modelResources.flatMap((model, index) => {
    const photoItemKey = modelResourceItemKey("PHOTO", index, model);
    const sheetItemKey = modelResourceItemKey("TECHNICAL_SHEET", index, model);
    const photoSnapshot: FirstContactResourceSnapshot = {
      schema: 1,
      resource: "PHOTO",
      vehicleIndex: index,
      modelId: model.modelId,
      modelName: model.modelName,
      selectedColorId: model.selectedColorId,
      selectedColorName: model.selectedColorName,
      source: model.imageSource,
      assetId: model.imageAssetId,
      storagePath: model.imageStoragePath,
      fileName: model.imageFileName,
      publicUrl: model.imageUrl,
    };
    const sheetSnapshot: FirstContactResourceSnapshot = {
      schema: 1,
      resource: "TECHNICAL_SHEET",
      vehicleIndex: index,
      modelId: model.modelId,
      modelName: model.modelName,
      selectedColorId: null,
      selectedColorName: null,
      source: model.technicalSheetUrl ? "MODEL_SHEET" : "NONE",
      assetId: model.technicalSheetAssetId,
      storagePath: model.technicalSheetStoragePath,
      fileName: model.technicalSheetFileName,
      publicUrl: model.technicalSheetUrl,
    };
    resourcesByItemKey[photoItemKey] = model;
    resourcesByItemKey[sheetItemKey] = model;
    return [
      { resourceKind: "PHOTOS" as const, itemKey: photoItemKey, resourceVersion: model.imageUrl ?? `unavailable-${model.modelId ?? modelSlug(model.modelName)}-photo-v1`, availability: model.imageUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const, resourceSnapshot: photoSnapshot },
      { resourceKind: "TECHNICAL_SHEET" as const, itemKey: sheetItemKey, resourceVersion: model.technicalSheetUrl ?? `unavailable-${model.modelId ?? modelSlug(model.modelName)}-sheet-v1`, availability: model.technicalSheetUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const, resourceSnapshot: sheetSnapshot },
    ];
  });
  return { items, resourcesByItemKey };
}

export function getResourcesForItem(item: Pick<FirstContactItem, "resourceKind" | "itemKey">, modelResources: FirstContactModelResources[], resourcesByItemKey: Record<string, FirstContactModelResources>): FirstContactModelResources | null {
  const exact = resourcesByItemKey[item.itemKey];
  if (exact) return exact;
  // Historical operations used one unscoped PHOTO and one unscoped sheet. Keep
  // their retries pointed at the first selected model without creating new
  // operation items or effects.
  if ((item.resourceKind === "PHOTOS" || item.resourceKind === "TECHNICAL_SHEET") && !isModelScopedResourceKey(item.itemKey)) return modelResources[0] ?? null;
  return null;
}
