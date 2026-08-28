import type { FirstContactResource, FirstContactResult } from "@/lib/first-contact/types";

const firstContactResourceOrder: Record<FirstContactResource, number> = {
  MESSAGE: 0,
  PHOTOS: 1,
  TECHNICAL_SHEET: 2,
};

export function orderFirstContactItems<T extends { resourceKind: FirstContactResource }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftScoped = "itemKey" in left && typeof left.itemKey === "string" ? left.itemKey.match(/^(PHOTO|TECHNICAL_SHEET):(\d{2}):/) : null;
    const rightScoped = "itemKey" in right && typeof right.itemKey === "string" ? right.itemKey.match(/^(PHOTO|TECHNICAL_SHEET):(\d{2}):/) : null;
    if (left.resourceKind === "MESSAGE" || right.resourceKind === "MESSAGE") return firstContactResourceOrder[left.resourceKind] - firstContactResourceOrder[right.resourceKind];
    if (leftScoped && rightScoped) {
      const modelOrder = Number(leftScoped[2]) - Number(rightScoped[2]);
      if (modelOrder !== 0) return modelOrder;
      return (leftScoped[1] === "PHOTO" ? 0 : 1) - (rightScoped[1] === "PHOTO" ? 0 : 1);
    }
    if (leftScoped) return -1;
    if (rightScoped) return 1;
    return firstContactResourceOrder[left.resourceKind] - firstContactResourceOrder[right.resourceKind];
  });
}

export function shouldContinueFirstContact(resource: FirstContactResource, result: FirstContactResult): boolean {
  return resource !== "MESSAGE" || result === "ACCEPTED";
}
