import { modelResourceItemKey, planFirstContactResourceItems } from "../lib/first-contact/resource-plan.ts";
import { orderCatalogColors } from "../lib/catalog/color-order.ts";

const assert = (value, message) => { if (!value) throw new Error(message); };
const orderedColors = orderCatalogColors([
  { slug: "rojo", sort_order: 1, name: "Rojo" },
  { slug: "blanco", sort_order: 2, name: "Blanco" },
  { slug: "plateado", sort_order: 3, name: "Plateado" },
]);
assert(orderedColors.map((color) => color.slug).join("|") === "blanco|plateado|rojo", "color selector must share the catalog order");
const model = (name, index, selectedColorId = null) => ({
  modelName: name,
  modelId: `model-${index}`,
  imageUrl: `https://example.test/${index}.jpg`,
  imageFileName: `${name}.jpg`,
  imageSource: selectedColorId ? "COLOR_PHOTO" : "DEFAULT_COLOR_PHOTO",
  imageAssetId: `asset-${index}`,
  imageStoragePath: `${index}/photo.jpg`,
  selectedColorId,
  selectedColorName: selectedColorId ? `Color ${index}` : null,
  technicalSheetUrl: `https://example.test/${index}.pdf`,
  technicalSheetFileName: `${name}.pdf`,
  technicalSheetAssetId: `sheet-${index}`,
  technicalSheetStoragePath: `${index}/sheet.pdf`,
});

for (const count of [1, 2, 3]) {
  const { items } = planFirstContactResourceItems(Array.from({ length: count }, (_, index) => model(`Model ${index + 1}`, index, index === 0 ? "color-1" : null)));
  assert(items.length === count * 2, `${count} models must produce two resources per model`);
  assert(items.every((item) => item.resourceSnapshot?.vehicleIndex < 3), "resource snapshot index must stay inside the first three boundary");
}

const five = Array.from({ length: 5 }, (_, index) => model(`Model ${index + 1}`, index));
const plan = planFirstContactResourceItems(five.slice(0, 3));
assert(plan.items.length === 6, "more than three models must only plan resources for the first three");
assert(plan.items.map((item) => item.itemKey).join("|") === [
  "PHOTO:01:model-0", "TECHNICAL_SHEET:01:model-0", "PHOTO:02:model-1", "TECHNICAL_SHEET:02:model-1", "PHOTO:03:model-2", "TECHNICAL_SHEET:03:model-2",
].join("|"), "resource order must remain model-major and deterministic");
assert(new Set(plan.items.map((item) => item.itemKey)).size === plan.items.length, "resource keys must be unique");
assert(plan.items[0].resourceSnapshot?.selectedColorId === null, "default selection must be represented without a color ID");
assert(modelResourceItemKey("PHOTO", 0, five[0]) !== modelResourceItemKey("TECHNICAL_SHEET", 0, five[0]), "photo and sheet keys must not collide");

console.log("E3 First Contact color selection runtime checks: PASS");
