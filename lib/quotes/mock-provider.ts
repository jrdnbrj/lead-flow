import { createHash } from "node:crypto";

export type MockQuoteDocumentSendInput = {
  quoteFileId: string;
  recipientPhone: string;
  documentUrl: string;
  fileName: string;
};

export type MockQuoteDocumentSendResult = {
  providerMessageId: string;
  status: "MOCK_ACCEPTED";
};

/**
 * Local-only provider used by the NovaCredit slice. It deliberately does not
 * import or call Evolution; the stable id makes repeated local attempts
 * observable without pretending that a customer received a WhatsApp message.
 */
export function sendNovaCreditDocumentMock(input: MockQuoteDocumentSendInput): MockQuoteDocumentSendResult {
  const fingerprint = createHash("sha256")
    .update([input.quoteFileId, input.recipientPhone, input.documentUrl, input.fileName].join("\u001f"))
    .digest("hex")
    .slice(0, 24);
  return { providerMessageId: `local-novacredit-${fingerprint}`, status: "MOCK_ACCEPTED" };
}
