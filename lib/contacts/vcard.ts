import { normalizeWhatsappNumber } from "@/lib/domain/lead";

export type VCardContact = {
  name: string;
  phone: string;
  organization?: string;
  email?: string;
  note?: string;
};

export function escapeVCardText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

export function normalizeVCardPhone(phone: string): string {
  const normalized = normalizeWhatsappNumber(phone);
  if (normalized) return `+${normalized}`;
  return phone.trim().replace(/[^\d+]/g, "");
}

export function buildVCard(contact: VCardContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCardText(contact.name.trim())}`,
    `N:${escapeVCardText(contact.name.trim())};;;;`,
  `TEL;TYPE=CELL:${normalizeVCardPhone(contact.phone)}`,
  ];
  if (contact.organization?.trim()) lines.push(`ORG:${escapeVCardText(contact.organization.trim())}`);
  if (contact.email?.trim()) lines.push(`EMAIL:${escapeVCardText(contact.email.trim())}`);
  if (contact.note?.trim()) lines.push(`NOTE:${escapeVCardText(contact.note.trim())}`);
  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

export function vCardFilename(name: string): string {
  const safeName = name.normalize("NFC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "contacto";
  return `${safeName}.vcf`;
}
