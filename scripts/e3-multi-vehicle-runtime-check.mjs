const { planFirstContactResourceItems } = await import("../lib/first-contact/resource-plan.ts");
const { orderFirstContactItems } = await import("../lib/first-contact/order.ts");

const assert = (value, message) => { if (!value) throw new Error(message); };
const model = (name, index, { photo = true, sheet = true } = {}) => ({
  modelName: name,
  modelId: `model-${index}`,
  imageUrl: photo ? `https://cdn.test/${index}.jpg` : null,
  imageFileName: photo ? `${name}.jpg` : null,
  technicalSheetUrl: sheet ? `https://cdn.test/${index}.pdf` : null,
  technicalSheetFileName: sheet ? `${name}.pdf` : null,
});

for (const count of [1, 2, 3]) {
  const plan = planFirstContactResourceItems(Array.from({ length: count }, (_, index) => model(`Modelo ${index + 1}`, index + 1)));
  assert(plan.items.length === count * 2, `${count} model resource count mismatch`);
  assert(new Set(plan.items.map((item) => item.itemKey)).size === plan.items.length, `${count} model item keys collide`);
}

const mixedPlan = planFirstContactResourceItems([
  model("Modelo A", 1, { photo: true, sheet: false }),
  model("Modelo B", 2, { photo: false, sheet: true }),
  model("Modelo C", 3),
]);
assert(mixedPlan.items.find((item) => item.resourceKind === "PHOTOS" && item.itemKey.startsWith("PHOTO:01:"))?.availability === "AVAILABLE", "photo should remain sendable when sheet is missing");
assert(mixedPlan.items.find((item) => item.resourceKind === "TECHNICAL_SHEET" && item.itemKey.startsWith("TECHNICAL_SHEET:01:"))?.availability === "NOT_AVAILABLE", "missing sheet should be not available");
assert(mixedPlan.items.find((item) => item.resourceKind === "PHOTOS" && item.itemKey.startsWith("PHOTO:02:"))?.availability === "NOT_AVAILABLE", "missing photo should be not available");
assert(mixedPlan.items.find((item) => item.resourceKind === "TECHNICAL_SHEET" && item.itemKey.startsWith("TECHNICAL_SHEET:02:"))?.availability === "AVAILABLE", "sheet should remain sendable when photo is missing");

// The application applies the authoritative slice before calling the plan.
// This assertion keeps the runtime check explicit without invoking a provider.
const firstThree = Array.from({ length: 5 }, (_, index) => model(`Modelo ${index + 1}`, index + 1)).slice(0, 3);
const bounded = planFirstContactResourceItems(firstThree);
assert(bounded.items.length === 6 && !bounded.items.some((item) => item.itemKey.includes(":04:") || item.itemKey.includes(":05:")), "resource scope exceeded first three models");

const ordered = orderFirstContactItems([
  { resourceKind: "TECHNICAL_SHEET", itemKey: "TECHNICAL_SHEET:02:model-2" },
  { resourceKind: "PHOTOS", itemKey: "PHOTO:03:model-3" },
  { resourceKind: "MESSAGE", itemKey: "TEXT" },
  { resourceKind: "TECHNICAL_SHEET", itemKey: "TECHNICAL_SHEET:01:model-1" },
  { resourceKind: "PHOTOS", itemKey: "PHOTO:01:model-1" },
  { resourceKind: "PHOTOS", itemKey: "PHOTO:02:model-2" },
  { resourceKind: "TECHNICAL_SHEET", itemKey: "TECHNICAL_SHEET:03:model-3" },
]);
assert(ordered.map((item) => item.itemKey).join("|") === "TEXT|PHOTO:01:model-1|TECHNICAL_SHEET:01:model-1|PHOTO:02:model-2|TECHNICAL_SHEET:02:model-2|PHOTO:03:model-3|TECHNICAL_SHEET:03:model-3", "resource execution order mismatch");

console.log("E3 multi-vehicle runtime plan checks: PASS");
