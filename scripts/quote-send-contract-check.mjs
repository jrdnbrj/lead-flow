import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildQuoteSendIdempotencyKey,
  canRetryQuoteSendStatus,
  executeQuoteSendAttempt,
  QuoteProviderRejectedError,
} from "../lib/quotes/send.ts";

const quoteFileId = "11111111-1111-4111-8111-111111111111";
const sameKey = buildQuoteSendIdempotencyKey(quoteFileId, "593984790449");
assert.equal(sameKey, buildQuoteSendIdempotencyKey(quoteFileId, "593984790449"));
assert.notEqual(sameKey, buildQuoteSendIdempotencyKey("22222222-2222-4222-8222-222222222222", "593984790449"));
assert.notEqual(sameKey, buildQuoteSendIdempotencyKey(quoteFileId, "593999999999"));

assert.deepEqual(
  await executeQuoteSendAttempt({ send: async () => ({ providerMessageId: "provider-1", status: "PENDING" }) }),
  { result: "ACCEPTED", providerMessageId: "provider-1", providerStatus: "PENDING" },
);
assert.deepEqual(
  await executeQuoteSendAttempt({ send: async () => ({ providerMessageId: null, status: "PENDING" }) }),
  { result: "UNKNOWN", providerMessageId: null, providerStatus: "PENDING" },
);
assert.deepEqual(
  await executeQuoteSendAttempt({ send: async () => { throw new QuoteProviderRejectedError("provider rejected", "HTTP_400"); } }),
  { result: "FAILED", providerMessageId: null, providerStatus: null, errorCode: "HTTP_400" },
);
assert.deepEqual(
  await executeQuoteSendAttempt({ send: async () => { throw new Error("network timeout"); } }),
  { result: "UNKNOWN", providerMessageId: null, providerStatus: null },
);
assert.equal(canRetryQuoteSendStatus("FAILED"), true);
assert.equal(canRetryQuoteSendStatus("UNKNOWN"), false);
assert.equal(canRetryQuoteSendStatus("ACCEPTED"), false);

const migration = fs.readFileSync("supabase/migrations/070_quote_file_sends.sql", "utf8");
assert.match(migration, /create table if not exists public\.quote_file_sends/);
assert.match(migration, /idempotency_key text not null unique/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.quote_file_sends from anon, authenticated/i);
assert.match(migration, /claim_quote_file_send_v1/);
assert.match(migration, /begin_quote_file_send_io_v1/);
assert.match(migration, /record_quote_file_send_result_v1/);
assert.doesNotMatch(migration, /lead_contact_operations|external_effects/);

const action = fs.readFileSync("lib/quotes/actions.ts", "utf8");
const workspace = fs.readFileSync("components/quotes/quote-workspace.tsx", "utf8");
assert.match(action, /prepareCardQuoteSendAction/);
assert.match(action, /sendCardQuoteAction/);
assert.match(action, /quoteSnapshotsEquivalent/);
assert.match(action, /sendWhatsappDocument/);
assert.match(action, /getCustomerEvolutionInstanceName/);
assert.doesNotMatch(action, /WHATSAPP_REMINDER|leadflow-reminders/);
assert.match(workspace, /Enviar cotización/);
assert.match(workspace, /Enviar por WhatsApp/);
assert.match(workspace, /Ver PDF que se enviará/);

console.log("Quote send contract checks: PASS");
