export type FirstContactResource = "MESSAGE" | "PHOTOS" | "TECHNICAL_SHEET";
export type FirstContactResult = "ACCEPTED" | "FAILED" | "UNKNOWN" | "NOT_AVAILABLE";
export type FirstContactAvailability = "AVAILABLE" | "NOT_AVAILABLE";

export type FirstContactResourceSnapshot = {
  schema: 1;
  resource: "PHOTO" | "TECHNICAL_SHEET";
  vehicleIndex: number;
  modelId: string | null;
  modelName: string;
  selectedColorId: string | null;
  selectedColorName: string | null;
  source: "COLOR_PHOTO" | "DEFAULT_COLOR_PHOTO" | "MODEL_PHOTO" | "LEGACY_PHOTO" | "MODEL_SHEET" | "NONE";
  assetId: string | null;
  storagePath: string | null;
  fileName: string | null;
  publicUrl: string | null;
};

export function firstContactResourceLabel(resource: FirstContactResource): string {
  return { MESSAGE: "Mensaje", PHOTOS: "Fotos", TECHNICAL_SHEET: "Ficha técnica" }[resource];
}

export type FirstContactItem = {
  id: string;
  resourceKind: FirstContactResource;
  itemKey: string;
  resourceVersion: string;
  availability: FirstContactAvailability;
  result: FirstContactResult | null;
  effectId: string | null;
  leadMessageId: string | null;
  providerMessageId: string | null;
  resourceSnapshot?: FirstContactResourceSnapshot | null;
};

export type FirstContactOperation = {
  id: string;
  leadId: string;
  operationType: "FIRST_CONTACT";
  operationVersion: number;
  status: "REQUESTED" | "RUNNING" | "PARTIAL" | "COMPLETE" | "FAILED" | "UNKNOWN";
};

export type FirstContactOperationResult = {
  status: string;
  replayed: boolean;
  operation: FirstContactOperation;
  items: FirstContactItem[];
};

export type ProviderOutcome = {
  result: "ACCEPTED" | "FAILED" | "UNKNOWN";
  providerMessageId?: string | null;
  providerStatus?: string | null;
};

export type FirstContactProvider = {
  sendMessage(input: { phone: string; text: string }): Promise<ProviderOutcome>;
  sendPhoto(input: { phone: string; imageUrl: string; caption: string; fileName: string }): Promise<ProviderOutcome>;
  sendDocument(input: { phone: string; documentUrl: string; caption: string; fileName: string }): Promise<ProviderOutcome>;
};
