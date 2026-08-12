import fs from "node:fs";

const runbook = fs.readFileSync("supabase/verification/e4-s10-safe-reopen-runbook.md", "utf8");
const report = fs.readFileSync("supabase/verification/e4-s10-safe-reopen-report.md", "utf8");
const ok = runbook.includes("AUTH_REQUIRED=true") && runbook.includes("do not relax RLS/grants") && report.includes("DEFERRED_RUNTIME_VALIDATION");
console.log(JSON.stringify({ status: ok ? "PASS" : "FAIL", runtime_validation: "DEFERRED_RUNTIME_VALIDATION" }));
process.exit(ok ? 0 : 1);
