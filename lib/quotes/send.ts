export type QuoteSendResult = "ACCEPTED" | "FAILED" | "UNKNOWN";

export type QuoteProviderResponse = {
  providerMessageId: string | null;
  status: string | null;
};

export class QuoteProviderRejectedError extends Error {
  readonly code: string;

  constructor(message: string, code = "PROVIDER_REJECTED") {
    super(message);
    this.name = "QuoteProviderRejectedError";
    this.code = code;
  }
}

export type QuoteSendAttemptOutcome = {
  result: QuoteSendResult;
  providerMessageId: string | null;
  providerStatus: string | null;
  errorCode?: string;
};

export function buildQuoteSendIdempotencyKey(quoteFileId: string, normalizedPhone: string): string {
  return `quote-file:${quoteFileId.trim().toLowerCase()}:recipient:${normalizedPhone.trim()}`;
}

export function canRetryQuoteSendStatus(status: string): boolean {
  return status === "FAILED";
}

export async function executeQuoteSendAttempt(input: { send: () => Promise<QuoteProviderResponse> }): Promise<QuoteSendAttemptOutcome> {
  try {
    const response = await input.send();
    if (!response.providerMessageId?.trim()) {
      return { result: "UNKNOWN", providerMessageId: null, providerStatus: response.status };
    }
    return { result: "ACCEPTED", providerMessageId: response.providerMessageId, providerStatus: response.status };
  } catch (error) {
    if (error instanceof QuoteProviderRejectedError) {
      return { result: "FAILED", providerMessageId: null, providerStatus: null, errorCode: error.code };
    }
    return { result: "UNKNOWN", providerMessageId: null, providerStatus: null };
  }
}
