import fs from "node:fs";

const report = fs.readFileSync("supabase/verification/e4-s9-brownfield-smoke-report.md", "utf8");
const required = ["login_logout", "capture_dashboard", "webhook_matrix", "realtime", "soft_delete", "privacy_negatives"];
const ok = required.every((id) => report.includes(`| ${id} |`)) && report.includes("DEFERRED_RUNTIME_VALIDATION") && report.includes("AUTH_REQUIRED=true");
console.log(JSON.stringify({ status: ok ? "PASS" : "FAIL", runtime_validation: "DEFERRED_RUNTIME_VALIDATION" }));
process.exit(ok ? 0 : 1);
