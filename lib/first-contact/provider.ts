import { sendWhatsappDocument, sendWhatsappMedia, sendWhatsappText } from "@/lib/whatsapp/service";
import type { FirstContactProvider, ProviderOutcome } from "@/lib/first-contact/types";

export function classifyProviderError(error: unknown): ProviderOutcome["result"] {
  const text = error instanceof Error ? error.message.toLowerCase() : "";
  return text.includes("timeout") || text.includes("network") || text.includes("connection") ? "UNKNOWN" : "FAILED";
}

export function createEvolutionFirstContactProvider(): FirstContactProvider {
  return {
    async sendMessage(input) {
      try {
        const result = await sendWhatsappText(input);
        return { result: "ACCEPTED", providerMessageId: result.providerMessageId, providerStatus: result.status };
      } catch (error) {
        return { result: classifyProviderError(error), providerMessageId: null, providerStatus: null };
      }
    },
    async sendPhoto(input) {
      try {
        const result = await sendWhatsappMedia({ phone: input.phone, mediaUrl: input.imageUrl, caption: input.caption, fileName: input.fileName });
        return { result: "ACCEPTED", providerMessageId: result.providerMessageId, providerStatus: result.status };
      } catch (error) {
        return { result: classifyProviderError(error), providerMessageId: null, providerStatus: null };
      }
    },
    async sendDocument(input) {
      try {
        const result = await sendWhatsappDocument({ phone: input.phone, documentUrl: input.documentUrl, caption: input.caption, fileName: input.fileName });
        return { result: "ACCEPTED", providerMessageId: result.providerMessageId, providerStatus: result.status };
      } catch (error) {
        return { result: classifyProviderError(error), providerMessageId: null, providerStatus: null };
      }
    },
  };
}

export function createFakeFirstContactProvider(outcomes: Partial<Record<"MESSAGE" | "PHOTOS" | "TECHNICAL_SHEET", ProviderOutcome>> = {}): FirstContactProvider {
  return {
    async sendMessage() { return outcomes.MESSAGE ?? { result: "ACCEPTED", providerMessageId: "fake-message-id", providerStatus: "SENT" }; },
    async sendPhoto() { return outcomes.PHOTOS ?? { result: "ACCEPTED", providerMessageId: "fake-photo-id", providerStatus: "SENT" }; },
    async sendDocument() { return outcomes.TECHNICAL_SHEET ?? { result: "ACCEPTED", providerMessageId: "fake-document-id", providerStatus: "SENT" }; },
  };
}
