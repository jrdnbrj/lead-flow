import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createJwtClockSkewRetryFetch,
  JWT_CLOCK_SKEW_RETRY_DELAYS_MS,
} from "../lib/supabase/fetch-with-jwt-clock-skew-retry.ts";
import { AUTHENTICATED_RPC_POLICIES } from "../lib/supabase/authenticated-rpc-policy.ts";

const helper = fs.readFileSync("lib/supabase/fetch-with-jwt-clock-skew-retry.ts", "utf8");
const clients = ["lib/supabase/server.ts", "lib/supabase/proxy.ts", "lib/supabase/client.ts", "lib/supabase/admin.ts"];
const purchaseFallbackMigration = fs.readFileSync("supabase/migrations/076_purchase_rpc_server_fallback.sql", "utf8");
const authenticatedRpc = fs.readFileSync("lib/supabase/authenticated-rpc.ts", "utf8");
const policy = fs.readFileSync("lib/supabase/authenticated-rpc-policy.ts", "utf8");
const migration078 = fs.readFileSync("supabase/migrations/078_authenticated_rpc_jwt_fallback.sql", "utf8");
const authenticatedRpcSources = [
  fs.readFileSync("lib/leads/repository.ts", "utf8"),
  fs.readFileSync("app/api/push/command/route.ts", "utf8"),
  fs.readFileSync("app/api/push/subscription/route.ts", "utf8"),
];

assert.match(helper, /PGRST303/);
assert.match(helper, /JWT issued at future/);
assert.match(helper, /response\.status !== 401/);
assert.match(helper, /startsWith\("\/rest\/v1\/"\)/);
assert.ok(JWT_CLOCK_SKEW_RETRY_DELAYS_MS.length > 0 && JWT_CLOCK_SKEW_RETRY_DELAYS_MS.length <= 3, "retry budget must remain bounded");
for (const file of clients) {
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /fetch-with-jwt-clock-skew-retry/);
  assert.match(source, /global:\s*\{\s*fetch:\s*fetchWithJwtClockSkewRetry/);
}
const repository = fs.readFileSync("lib/leads/repository.ts", "utf8");
assert.match(repository, /authenticated-rpc/);
assert.doesNotMatch(repository, /serverRpcFallbackFunctions/);
assert.match(authenticatedRpc, /AUTHENTICATED_RPC_POLICIES/);
assert.match(authenticatedRpc, /server-only/);
assert.doesNotMatch(authenticatedRpc, /grant execute|create or replace function/i);
assert.match(policy, /SERVER_FALLBACK/);

const invokedRpcNames = new Set();
for (const source of authenticatedRpcSources) {
  for (const match of source.matchAll(/invokeAuthenticatedRpc\(\s*[^,]+,\s*["']([^"']+)["']/g)) invokedRpcNames.add(match[1]);
}
assert.ok(invokedRpcNames.size > 0, "authenticated RPC calls must use the centralized helper");
for (const functionName of invokedRpcNames) {
  assert.ok(Object.hasOwn(AUTHENTICATED_RPC_POLICIES, functionName), `${functionName} must be registered in the recovery policy`);
}

const serverFallbackMigrations = [
  fs.readFileSync("supabase/migrations/058_e3_server_rpc_fallback.sql", "utf8"),
  fs.readFileSync("supabase/migrations/060_first_contact_color_selection_snapshot.sql", "utf8"),
  fs.readFileSync("supabase/migrations/072_follow_up_server_rpc_fallback.sql", "utf8"),
  purchaseFallbackMigration,
  migration078,
].join("\n");
for (const [functionName, recovery] of Object.entries(AUTHENTICATED_RPC_POLICIES)) {
  if (recovery !== "SERVER_FALLBACK") continue;
  assert.match(serverFallbackMigrations, new RegExp(`grant execute on function public\\.${functionName}`, "i"), `${functionName} server grant is missing`);
}
assert.doesNotMatch(purchaseFallbackMigration, /purchase_case|first_contact|whatsapp|evolution/i, "purchase fallback migration must stay scoped");
for (const functionName of ["correct_inbound_response_v1", "get_purchase_case_v1", "ensure_purchase_case_v1", "complete_purchase_milestone_v1", "revert_purchase_milestone_v1"]) {
  assert.match(migration078, new RegExp(`create or replace function public\\.${functionName}`, "i"), `${functionName} must be covered by the forward migration`);
}
assert.equal((migration078.match(/auth\.role\(\) <> 'service_role'/g) ?? []).length, 4, "purchase RPCs must preserve advisor authorization while accepting service_role fallback");
assert.doesNotMatch(migration078, /drop table|delete from|truncate /i, "JWT fallback migration must not mutate data");
assert.doesNotMatch(migration078, /upsert_push_subscription_v1.*to service_role/is, "push subscription must remain session-authorized");
assert.match(fs.readFileSync("app/api/internal/whatsapp-reminders/dispatch/route.ts", "utf8"), /fetchWithJwtClockSkewRetry/);
const ci = fs.readFileSync("scripts/ci-contract-checks.sh", "utf8");
assert.match(ci, /scripts\/jwt-clock-skew-contract-check\.mjs/);

const originalFetch = globalThis.fetch;

async function runScenario(responses, options = {}, url = "https://example.supabase.co/rest/v1/rpc/test") {
  let calls = 0;
  const requestBodies = [];
  globalThis.fetch = async (input) => {
    calls += 1;
    requestBodies.push(await input.clone().text());
    const response = responses[Math.min(calls - 1, responses.length - 1)];
    return typeof response === "function" ? response() : response;
  };

  try {
    const fetcher = createJwtClockSkewRetryFetch({ delaysMs: [], ...options });
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ safe: true }),
    });
    return { calls, response, requestBodies };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const future = () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
const accepted = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

let result = await runScenario([future(), accepted()], { delaysMs: [1], sleep: async () => {} });
assert.equal(result.calls, 2, "PGRST303 should retry once with the configured budget");
assert.equal(result.response.status, 200);
assert.deepEqual(result.requestBodies, [JSON.stringify({ safe: true }), JSON.stringify({ safe: true })]);

result = await runScenario([future()], { delaysMs: [1, 1], sleep: async () => {} });
assert.equal(result.calls, 3, "persistent PGRST303 must stop at the bounded retry budget");
assert.equal(result.response.status, 401);

result = await runScenario([new Response("unauthorized", { status: 401 })], { delaysMs: [1], sleep: async () => {} });
assert.equal(result.calls, 1, "ordinary REST 401 must not retry");

result = await runScenario([future(), accepted()], { delaysMs: [1], sleep: async () => {} }, "https://example.supabase.co/storage/v1/object/catalog/photo.jpg");
assert.equal(result.calls, 1, "Storage must not use the PostgREST retry");

result = await runScenario([future(), accepted()], { delaysMs: [1], sleep: async () => {} }, "https://evolution.example.test/message/sendText/chat-instance");
assert.equal(result.calls, 1, "provider endpoints must not use the PostgREST retry");

globalThis.fetch = async () => new Response(JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }), { status: 401 });
try {
  const fetcher = createJwtClockSkewRetryFetch({ delaysMs: [1], sleep: async () => {} });
  const response = await fetcher("https://example.supabase.co/auth/v1/token", { method: "POST", body: "{}" });
  assert.equal(response.status, 401, "Auth endpoint must not use the PostgREST retry");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("JWT clock-skew contract checks: PASS");
