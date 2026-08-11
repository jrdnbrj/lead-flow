import { readFileSync } from "node:fs";

const files = {
  advisor: "lib/auth/advisor.ts",
  entrypoints: "lib/auth/entrypoints.ts",
  proxy: "proxy.ts",
  login: "app/login/page.tsx",
  loginActions: "app/login/actions.ts",
  dashboard: "app/dashboard/page.tsx",
  nuevo: "app/nuevo/page.tsx",
  whatsapp: "app/whatsapp/page.tsx",
  qr: "app/qr/page.tsx",
  leadActions: "lib/leads/actions.ts",
  repository: "lib/leads/repository.ts",
  configActions: "lib/config/actions.ts",
  messageActions: "lib/config/message-actions.ts",
  whatsappActions: "lib/whatsapp/actions.ts",
  webhook: "app/api/webhooks/evolution/route.ts",
  actionResponse: "lib/domain/lead.ts",
  dashboardClient: "components/dashboard/dashboard-client.tsx",
  leadCaptureForm: "components/leads/lead-capture-form.tsx",
  sellerProfileForm: "components/whatsapp/seller-profile-form.tsx",
  messageTemplateEditor: "components/whatsapp/message-template-editor.tsx",
  unlinkButton: "components/whatsapp/unlink-button.tsx",
};

const text = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]));
const failures = [];

function requireMatch(key, pattern, message) {
  if (!pattern.test(text[key])) failures.push(`${files[key]}: ${message}`);
}

requireMatch("advisor", /auth\.getClaims\(\)/, "requireAdvisor must use getClaims()");
requireMatch("advisor", /leadflow_installation|getInstallationAdvisorUserId/, "requireAdvisor must compare against singleton installation owner");
requireMatch("advisor", /AUTH_REQUIRED/, "requireAdvisor must return AUTH_REQUIRED for authorization failures");
requireMatch("login", /loginAction/, "/login must use email/password server action");
requireMatch("loginActions", /signInWithPassword/, "login action must use Supabase email/password auth");
requireMatch("loginActions", /signOut/, "logout action must exist");
requireMatch("proxy", /createSupabaseProxyClient/, "proxy must refresh Supabase cookies");
requireMatch("proxy", /NextResponse\.redirect/, "proxy must redirect protected missing sessions to /login");
requireMatch("dashboard", /requireAdvisorOrRedirect|isAuthRequiredEnabled/, "dashboard must apply the AUTH_REQUIRED=true matrix guard");
requireMatch("nuevo", /requireAdvisorOrRedirect|isAuthRequiredEnabled/, "new lead page must apply the AUTH_REQUIRED=true matrix guard");
requireMatch("whatsapp", /requireAdvisorOrRedirect/, "/whatsapp must always require advisor session");
requireMatch("qr", /requireAdvisorOrRedirect|isAuthRequiredEnabled/, "/qr must apply the AUTH_REQUIRED=true matrix guard");
requireMatch("leadActions", /requireAdvisor\(/, "private lead server actions must call requireAdvisor()");
requireMatch("leadActions", /authRequiredResult\(\)/, "private lead server actions must return functional AUTH_REQUIRED");
requireMatch("configActions", /requireAdvisor\(/, "settings server action must call requireAdvisor()");
requireMatch("messageActions", /requireAdvisor\(/, "message template server action must call requireAdvisor()");
requireMatch("whatsappActions", /requireAdvisor\(/, "WhatsApp server action must call requireAdvisor()");
requireMatch("entrypoints", /EVOLUTION_WEBHOOK_TOKEN/, "webhook token validator must use EVOLUTION_WEBHOOK_TOKEN server-side");
requireMatch("entrypoints", /LEADFLOW_SCHEDULER_SECRET/, "scheduler validator must use LEADFLOW_SCHEDULER_SECRET server-side");
requireMatch("webhook", /validateEvolutionWebhookRequest/, "Evolution webhook must use provider token validator");
requireMatch("webhook", /ForProvider/, "Evolution webhook must use provider-mode repository functions instead of cookie-bound human functions");
requireMatch("repository", /createSupabaseAdminClient/, "provider repository path must use a server-side privileged client");
requireMatch("repository", /getInstallationAdvisorUserId/, "provider repository path must derive the singleton owner internally");
requireMatch("repository", /isProviderOwnedLead/, "provider repository path must validate singleton ownership before provider updates");
requireMatch("repository", /findProviderOwnedMessageByProviderId/, "provider message lookup must validate parent lead ownership");
requireMatch("repository", /userData\.user\.id !== ownerId/, "authenticated legacy lead capture must not assign singleton ownership to a non-advisor session");
requireMatch("actionResponse", /message\?: string/, "ActionResponse must carry a functional message separate from machine error code");
for (const key of ["dashboardClient", "leadCaptureForm", "sellerProfileForm", "messageTemplateEditor", "unlinkButton"]) {
  requireMatch(key, /response\.message \|\| response\.error/, "client must display functional AUTH_REQUIRED message before machine code");
}

for (const [key, content] of Object.entries(text)) {
  if (/NEXT_PUBLIC_.*(SECRET|TOKEN|SERVICE_ROLE|PRIVATE_KEY)|LEADFLOW_SCHEDULER_SECRET.*process\.env\.NEXT_PUBLIC/i.test(content)) {
    failures.push(`${files[key]}: secret-like value appears client-public`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("E4-S3_AUTH_CONTRACT_PASS");
