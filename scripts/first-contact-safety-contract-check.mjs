import fs from "node:fs";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`Production safety contract: ${message}`);
}

const command = read("lib/first-contact/command.ts");
const repository = read("lib/leads/repository.ts");
const webhook = read("app/api/webhooks/evolution/route.ts");
const reminder = read("lib/whatsapp/reminders.ts");
const serverRpcFallback = read("supabase/migrations/058_e3_server_rpc_fallback.sql");
const recovery = read("supabase/migrations/059_e3_resource_recovery.sql");
const compose = read("docker-compose.production.yml");

assert(command.includes("const messageAccepted"), "message acceptance gate is missing");
assert(command.includes("if (messageAccepted)"), "resources are not gated behind accepted message");
assert(command.includes('result: "UNKNOWN"'), "provider ambiguity is not recorded as UNKNOWN");
assert(command.includes("hydrateMissingFirstContactResource"), "resource recovery path is missing");
assert(command.includes("retryFirstContactResourceFromRecovery"), "independent resource retry path is missing");

assert(repository.includes("createSupabaseAdminClient() ?? await createSupabaseServerClient()"), "catalog lookup does not prefer the server-only client");
assert(repository.includes('throw new Error("FIRST_CONTACT_CATALOG_LOOKUP_FAILED")'), "catalog query errors can regress to false availability");
assert(repository.includes("export async function hydrateFirstContactResource"), "server-only resource hydration boundary is missing");

assert(webhook.includes("belongsToCustomerInstance"), "Evolution webhook instance isolation is missing");
assert(webhook.includes("if (!belongsToCustomerInstance"), "webhook does not reject non-customer instances before persistence");
assert(reminder.includes("reminderInstance === customerInstance"), "reminder/customer instance separation is missing");
assert(reminder.includes("/message/sendText/"), "reminder send does not target an explicit instance");

assert(serverRpcFallback.includes("grant execute on function public.request_first_contact_v1"), "server First Contact RPC grants are missing");
assert(serverRpcFallback.includes("grant execute on function public.record_first_contact_effect_result_v1"), "server effect result RPC grant is missing");
assert(recovery.includes("never creates new historical operation items"), "resource recovery historical-operation guard is missing");
assert(recovery.includes("revoke all on function public.hydrate_first_contact_resource_v1"), "resource recovery browser-write protection is missing");

assert(compose.includes("SUPABASE_SERVICE_ROLE_KEY"), "server Supabase credential is not explicitly scoped to LeadFlow");
assert(compose.includes("EVOLUTION_API_INSTANCE_NAME"), "customer Evolution instance is not explicit in production config");
assert(!compose.includes("ports:\n      - \"8080"), "Evolution API must not be publicly published");

console.log("Production safety contract checks: PASS");
