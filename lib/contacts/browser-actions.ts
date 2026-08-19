import { buildVCard, type VCardContact, vCardFilename } from "@/lib/contacts/vcard";

export type ContactActionResult = "shared" | "copied" | "downloaded";

export function isWebShareAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareVCard(contact: VCardContact): Promise<ContactActionResult> {
  if (!isWebShareAvailable()) throw new Error("Este dispositivo no permite compartir desde el navegador.");
  const vCard = buildVCard(contact);
  const file = typeof File === "undefined" ? null : new File([vCard], vCardFilename(contact.name), { type: "text/vcard;charset=utf-8" });
  let fileShareAvailable = false;
  try {
    fileShareAvailable = Boolean(file && navigator.canShare?.({ files: [file] }));
  } catch {
    fileShareAvailable = false;
  }
  if (fileShareAvailable && file) {
    try {
      await navigator.share({ files: [file], title: `Contacto de ${contact.name}` });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      // Algunos navegadores anuncian soporte de archivos pero rechazan el vCard
      // al abrir la hoja nativa. El texto es un fallback permitido y explícito.
    }
  }
  await navigator.share({ title: `Contacto de ${contact.name}`, text: vCard });
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
