import { formatPhoneForWhatsapp } from "@/lib/domain/lead";

export function buildWhatsAppUrl(phone: string, message?: string): string {
  const number = formatPhoneForWhatsapp(phone);
  const base = `https://wa.me/${number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
