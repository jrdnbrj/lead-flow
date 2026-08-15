import { buildVCard, type VCardContact, vCardFilename } from "@/lib/contacts/vcard";

export type ContactActionResult = "shared" | "copied" | "downloaded";

export async function shareVCard(contact: VCardContact): Promise<ContactActionResult> {
  const vCard = buildVCard(contact);
  if (navigator.share) {
    const file = typeof File === "undefined" ? null : new File([vCard], vCardFilename(contact.name), { type: "text/vcard;charset=utf-8" });
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Contacto de ${contact.name}` });
      } else {
        await navigator.share({ title: `Contacto de ${contact.name}`, text: vCard });
      }
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      downloadVCard(contact);
      return "downloaded";
    }
  }
  try {
    await copyVCard(contact);
    return "copied";
  } catch {
    downloadVCard(contact);
    return "downloaded";
  }
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
