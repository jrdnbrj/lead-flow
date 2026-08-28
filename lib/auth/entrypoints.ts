function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function bearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}

export function validateEvolutionWebhookRequest(request: Request): boolean {
  const expectedToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
  const receivedToken = request.headers.get("x-evolution-webhook-token");
  return Boolean(expectedToken && receivedToken && timingSafeEqualString(receivedToken, expectedToken));
}

export function validateSchedulerSecret(headers: Headers): boolean {
  const expectedSecret = process.env.LEADFLOW_SCHEDULER_SECRET;
  const receivedSecret = headers.get("x-leadflow-scheduler-secret") ?? bearerToken(headers.get("authorization"));
  return Boolean(expectedSecret && receivedSecret && timingSafeEqualString(receivedSecret, expectedSecret));
}

export function validateWhatsappReminderDispatcherRequest(headers: Headers): boolean {
  const expectedSecret = process.env.WHATSAPP_REMINDER_DISPATCH_SECRET;
  const receivedSecret = headers.get("x-leadflow-whatsapp-reminder-secret") ?? bearerToken(headers.get("authorization"));
  return Boolean(expectedSecret && receivedSecret && timingSafeEqualString(receivedSecret, expectedSecret));
}
