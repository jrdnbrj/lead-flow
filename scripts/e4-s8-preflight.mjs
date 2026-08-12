import fs from "node:fs";

const required = [
  "supabase/verification/e4-s7-rls-grants-target-matrix.md",
  "supabase/verification/e4-s7-rls-grants-verification.sql",
  "supabase/verification/e4-s7-rls-grants-verification-report.md",
  "supabase/verification/e4-s8-cutover-writers.md",
  "supabase/verification/e4-s8-phase-b-cutover.sql",
  "supabase/verification/e4-s8-cutover-runbook.md",
];
const missing = required.filter((file) => !fs.existsSync(file));
const script = fs.readFileSync("supabase/verification/e4-s8-phase-b-cutover.sql", "utf8");
const forbidden = /\b(pg_sleep|dblink|SOURCE_DB_URL|TARGET_DB_URL|production|DROP|TRUNCATE|RESET)\b/i.test(script);
if (missing.length || forbidden || !script.includes("pg_advisory_xact_lock") || !script.includes("rollback;")) {
  console.error(JSON.stringify({ status: "FAIL", missing, forbidden }));
  process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", runtime_validation: "DEFERRED_RUNTIME_VALIDATION", required_artifacts: required }));
