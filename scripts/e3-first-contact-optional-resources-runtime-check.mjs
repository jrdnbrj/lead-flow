import { firstContactResourceModelEntries, planFirstContactResourceItems } from "../lib/first-contact/resource-plan.ts";

const assert = (value, message) => { if (!value) throw new Error(message); };
const model = (name, index, { photo = true, sheet = true } = {}) => ({
  modelName: name,
  modelId: `model-${index}`,
  vehicleIndex: index,
  imageUrl: photo ? `https://cdn.test/${index}.jpg` : null,
  imageFileName: photo ? `${name}.jpg` : null,
  imageSource: photo ? "MODEL_PHOTO" : "NONE",
  imageAssetId: photo ? `asset-${index}` : null,
  imageStoragePath: photo ? `${index}/photo.jpg` : null,
  selectedColorId: null,
  selectedColorName: null,
  technicalSheetUrl: sheet ? `https://cdn.test/${index}.pdf` : null,
  technicalSheetFileName: sheet ? `${name}.pdf` : null,
  technicalSheetAssetId: sheet ? `sheet-${index}` : null,
  technicalSheetStoragePath: sheet ? `${index}/sheet.pdf` : null,
});

const onlyOther = firstContactResourceModelEntries(["Otro modelo"]);
assert(onlyOther.length === 0, "Otro modelo alone must not produce resource models");
assert(planFirstContactResourceItems(onlyOther).items.length === 0, "Otro modelo alone must not produce resource items");

const mixed = firstContactResourceModelEntries(["Otro modelo", "CS55", "CS75", "S05", "S07"]);
assert(mixed.map(({ modelName }) => modelName).join("|") === "CS55|CS75|S05", "Otro modelo must be ignored and the first three real models retained");
assert(mixed.map(({ vehicleIndex }) => vehicleIndex).join("|") === "1|2|3", "original lead vehicle indexes must be preserved");

const messageOnly = [{ resourceKind: "MESSAGE", itemKey: "TEXT", resourceVersion: "message-v1", availability: "AVAILABLE" }];
assert(messageOnly.length === 1, "message-only operation must have one item");

const independent = planFirstContactResourceItems([model("CS55", 0, { photo: true, sheet: false }), model("CS75", 1, { photo: false, sheet: true })]);
assert(independent.items.find((item) => item.resourceKind === "PHOTOS")?.availability === "AVAILABLE", "available photo must remain sendable");
assert(independent.items.find((item) => item.resourceKind === "TECHNICAL_SHEET" && item.itemKey.startsWith("TECHNICAL_SHEET:01:"))?.availability === "NOT_AVAILABLE", "missing sheet must be independent");
assert(independent.items.find((item) => item.resourceKind === "PHOTOS" && item.itemKey.startsWith("PHOTO:02:"))?.availability === "NOT_AVAILABLE", "missing photo must be independent");
assert(independent.items.find((item) => item.resourceKind === "TECHNICAL_SHEET" && item.itemKey.startsWith("TECHNICAL_SHEET:02:"))?.availability === "AVAILABLE", "available sheet must remain sendable");

console.log("E3 First Contact optional resource runtime checks: PASS");
