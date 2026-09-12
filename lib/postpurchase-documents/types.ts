export const purchaseCaseDocumentTypes = [
  "INVOICE",
  "FONDO_VIAL",
  "RAMV",
  "PAYMENT_ORDER",
  "PAYMENT_RECEIPT",
  "REGISTRATION",
  "OTHER",
] as const;

export type PurchaseCaseDocumentType = (typeof purchaseCaseDocumentTypes)[number];
export type PurchaseCaseDocumentStatus = "ACTIVE" | "REPLACED" | "DELETED";

export const purchaseCaseDocumentLabels: Record<PurchaseCaseDocumentType, string> = {
  INVOICE: "Factura",
  FONDO_VIAL: "Fondo vial",
  RAMV: "RAMV",
  PAYMENT_ORDER: "Orden de pago",
  PAYMENT_RECEIPT: "Comprobante de pago",
  REGISTRATION: "Matrícula",
  OTHER: "Otro documento",
};

export const singleActivePurchaseCaseDocumentTypes: readonly PurchaseCaseDocumentType[] = [
  "INVOICE",
  "FONDO_VIAL",
  "RAMV",
  "REGISTRATION",
];

export const purchaseCaseDocumentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PurchaseCaseDocumentMimeType = (typeof purchaseCaseDocumentMimeTypes)[number];

export interface PurchaseCaseDocument {
  id: string;
  purchaseCaseId: string;
  documentType: PurchaseCaseDocumentType;
  status: PurchaseCaseDocumentStatus;
  originalFilename: string;
  mimeType: PurchaseCaseDocumentMimeType;
  sizeBytes: number;
  replacedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type PurchaseCaseDocumentAccess = Pick<PurchaseCaseDocument, "id" | "documentType" | "status" | "originalFilename" | "mimeType" | "sizeBytes" | "createdAt">;
