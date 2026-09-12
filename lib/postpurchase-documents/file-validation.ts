import type { PurchaseCaseDocumentMimeType } from "./types";

const purchaseCaseDocumentMimeTypes: readonly PurchaseCaseDocumentMimeType[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export const PURCHASE_CASE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export function detectPurchaseCaseDocumentMime(bytes: Uint8Array): PurchaseCaseDocumentMimeType | null {
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function validatePurchaseCaseDocumentFile(input: { declaredMimeType: string; sizeBytes: number; bytes: Uint8Array }): { mimeType: PurchaseCaseDocumentMimeType; extension: "pdf" | "jpg" | "png" | "webp" } | null {
  if (!purchaseCaseDocumentMimeTypes.includes(input.declaredMimeType as PurchaseCaseDocumentMimeType)) return null;
  if (input.sizeBytes < 1 || input.sizeBytes > PURCHASE_CASE_DOCUMENT_MAX_BYTES) return null;
  const detected = detectPurchaseCaseDocumentMime(input.bytes);
  if (!detected || detected !== input.declaredMimeType) return null;
  const extension = detected === "application/pdf" ? "pdf" : detected === "image/jpeg" ? "jpg" : detected === "image/png" ? "png" : "webp";
  return { mimeType: detected, extension };
}
