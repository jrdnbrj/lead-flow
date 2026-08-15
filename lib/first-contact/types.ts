export type FirstContactResource = "MESSAGE" | "PHOTOS" | "TECHNICAL_SHEET";
export type FirstContactResult = "ACCEPTED" | "FAILED" | "UNKNOWN" | "NOT_AVAILABLE";
export type FirstContactAvailability = "AVAILABLE" | "NOT_AVAILABLE";

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
};
