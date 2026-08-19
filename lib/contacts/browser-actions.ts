import { buildVCard, type VCardContact, vCardFilename } from "@/lib/contacts/vcard";

export type ContactActionResult = "shared" | "copied" | "downloaded";

export function isWebShareAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareVCard(contact: VCardContact): Promise<ContactActionResult> {
  if (!isWebShareAvailable()) throw new Error("Este dispositivo no permite compartir desde el navegador.");
  const lines = [
    contact.name.trim(),
    contact.phone.trim() ? `Teléfono: ${contact.phone.trim()}` : null,
    contact.organization?.trim() ? `Empresa: ${contact.organization.trim()}` : null,
    contact.email?.trim() ? `Correo: ${contact.email.trim()}` : null,
  ].filter((line): line is string => Boolean(line));
  // Use one native share call with readable contact data. Some Android/PWA
  // versions report vCard file sharing as supported but reject it after the
  // share sheet opens, and a second share call loses the user gesture.
  await navigator.share({ title: `Contacto de ${contact.name}`, text: lines.join("\n") });
  return "shared";
}

export async function copyVCard(contact: VCardContact): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Tu navegador no permite copiar el contacto automáticamente.");
  await navigator.clipboard.writeText(buildVCard(contact));
}

export function downloadVCard(contact: VCardContact): void {
  const blob = new Blob([buildVCard(contact)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = vCardFilename(contact.name);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
