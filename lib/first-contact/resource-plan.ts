import type { FirstContactItem } from "@/lib/first-contact/types";

export type FirstContactModelResources = {
  modelName: string;
  modelId: string | null;
  imageUrl: string | null;
  imageFileName: string | null;
  technicalSheetUrl: string | null;
  technicalSheetFileName: string | null;
};

export type FirstContactRequestItem = Pick<FirstContactItem, "resourceKind" | "itemKey" | "resourceVersion" | "availability">;

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
    resourcesByItemKey[photoItemKey] = model;
    resourcesByItemKey[sheetItemKey] = model;
    return [
      { resourceKind: "PHOTOS" as const, itemKey: photoItemKey, resourceVersion: model.imageUrl ?? `unavailable-${model.modelId ?? modelSlug(model.modelName)}-photo-v1`, availability: model.imageUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const },
      { resourceKind: "TECHNICAL_SHEET" as const, itemKey: sheetItemKey, resourceVersion: model.technicalSheetUrl ?? `unavailable-${model.modelId ?? modelSlug(model.modelName)}-sheet-v1`, availability: model.technicalSheetUrl ? "AVAILABLE" as const : "NOT_AVAILABLE" as const },
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
