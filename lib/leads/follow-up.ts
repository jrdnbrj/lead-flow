import type { Lead, NextActionType } from "@/lib/domain/lead";

export const SELLER_TIME_ZONE = "America/Guayaquil";

export type ScheduleShortcut = "POSTPONE_PLUS_ONE_HOUR" | "POSTPONE_LATER" | "POSTPONE_TOMORROW" | "POSTPONE_IN_THREE_DAYS";

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

export function resolveScheduleShortcut(shortcut: ScheduleShortcut, reference = new Date()): string {
  if (shortcut === "POSTPONE_PLUS_ONE_HOUR") return new Date(reference.getTime() + 60 * 60 * 1000).toISOString();
  const local = getSellerDateParts(reference);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: SELLER_TIME_ZONE, hour: "2-digit", hour12: false }).format(reference));
  if (shortcut === "POSTPONE_LATER") {
    const days = hour < 16 ? 0 : 1;
    return new Date(Date.UTC(local.year, local.month - 1, local.day + days, 21, 0, 0, 0)).toISOString();
  }
  const days = shortcut === "POSTPONE_TOMORROW" ? 1 : 3;
  return new Date(Date.UTC(local.year, local.month - 1, local.day + days, 14, 0, 0, 0)).toISOString();
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

export function formatScheduledDateTime(nextActionAt: string | null, reference = new Date()): string | null {
  if (!nextActionAt) return null;
  const target = new Date(nextActionAt);
  const today = getSellerDateParts(reference);
  const targetParts = getSellerDateParts(target);
  const targetDate = new Date(Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day));
  const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dayDifference = Math.round((targetDate.getTime() - todayDate.getTime()) / 86_400_000);
  const time = new Intl.DateTimeFormat("es-EC", {
    timeZone: SELLER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(target);

  if (dayDifference === 0) return `Hoy · ${time}`;
  if (dayDifference === 1) return `Mañana · ${time}`;
  return `${new Intl.DateTimeFormat("es-EC", { timeZone: SELLER_TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).format(target).replace(".", "")} · ${time}`;
}

export function formatElapsedSince(when: string | null, reference = new Date()): string | null {
  if (!when) return null;
  const elapsedMs = Math.max(0, reference.getTime() - new Date(when).getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "hace menos de 1 min";
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `hace ${elapsedHours} h`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `hace ${elapsedDays} ${elapsedDays === 1 ? "día" : "días"}`;
}

export function getNextActionDefaultLabel(actionType: NextActionType): string {
  return { CALL: "Llamar", WHATSAPP: "Escribir", QUOTE: "Cotizar", OTHER: "Seguimiento", RESPONSE: "Responder al cliente" }[actionType];
}

export function getDashboardLeadBucket(lead: Lead, reference = new Date()): 0 | 1 | 2 | 3 {
  if (lead.conversationState === "ACTIVE") return 0;
  const hasDueAction = lead.followUpActions.some((action) => (action.status === "PENDING" || action.status === "POSTPONED") && isLeadReminderDue(action.scheduledFor, reference));
  if (hasDueAction) return 1;
  const hasOpenAction = lead.followUpActions.some((action) => action.status === "PENDING" || action.status === "POSTPONED");
  if (!hasOpenAction) return 2;
  return 3;
}

export function sortLeadsForDashboard(leads: Lead[], reference = new Date()): Lead[] {
  return leads
    .map((lead, index) => ({ lead, index }))
    .sort((a, b) => getDashboardLeadBucket(a.lead, reference) - getDashboardLeadBucket(b.lead, reference) || a.index - b.index)
    .map(({ lead }) => lead);
}
