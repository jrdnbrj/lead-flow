import type { FirstContactResource, FirstContactResult } from "@/lib/first-contact/types";

const firstContactResourceOrder: Record<FirstContactResource, number> = {
  MESSAGE: 0,
  PHOTOS: 1,
  TECHNICAL_SHEET: 2,
};

export function orderFirstContactItems<T extends { resourceKind: FirstContactResource }>(items: T[]): T[] {
  return [...items].sort((left, right) => firstContactResourceOrder[left.resourceKind] - firstContactResourceOrder[right.resourceKind]);
}

export function shouldContinueFirstContact(resource: FirstContactResource, result: FirstContactResult): boolean {
  return resource !== "MESSAGE" || result === "ACCEPTED";
}
