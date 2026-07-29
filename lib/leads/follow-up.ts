import type { NextActionType } from "@/lib/domain/lead";

export const SELLER_TIME_ZONE = "America/Guayaquil";

function getSellerDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SELLER_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

/**
 * Returns midnight in Ecuador at the beginning of the requested calendar day.
 * Guayaquil stays at UTC-5, so Ecuador midnight is 05:00 UTC.
 */
export function getStartOfSellerDayAfter(days: number, reference = new Date()): string {
  const date = getSellerDateParts(reference);
  return new Date(Date.UTC(date.year, date.month - 1, date.day + days, 5, 0, 0, 0)).toISOString();
}

export function isLeadReminderDue(nextActionAt: string | null, reference = new Date()): boolean {
  return Boolean(nextActionAt && new Date(nextActionAt).getTime() <= reference.getTime());
}

export function formatNextActionDate(nextActionAt: string | null, reference = new Date()): string | null {
  if (!nextActionAt) return null;
  const target = new Date(nextActionAt);
  const today = getSellerDateParts(reference);
  const targetParts = getSellerDateParts(target);
  const targetDate = new Date(Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day));
  const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dayDifference = Math.round((targetDate.getTime() - todayDate.getTime()) / 86_400_000);

  if (dayDifference === 0) return "Hoy";
  if (dayDifference === 1) return "Mañana";

  return new Intl.DateTimeFormat("es-EC", { timeZone: SELLER_TIME_ZONE, weekday: "short", day: "numeric", month: "short" })
    .format(target)
    .replace(".", "");
}

export function getNextActionDefaultLabel(actionType: NextActionType): string {
  return { CALL: "Llamar", WHATSAPP: "Escribir", QUOTE: "Cotizar", OTHER: "Seguimiento" }[actionType];
}
