#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "Auth bootstrap preflight: $1" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || fail "jq is required"
scripts_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$scripts_dir/.." && pwd)"
cd "$repo_root"

if [[ -x "$repo_root/node_modules/.bin/supabase" ]]; then
  supabase_bin="$repo_root/node_modules/.bin/supabase"
else
  command -v npx >/dev/null 2>&1 || fail "Supabase CLI is required"
  supabase_bin="npx supabase"
fi

"$scripts_dir/assert-supabase-target.sh"

migration_file="supabase/migrations/010_leadflow_installation_and_settings_owner.sql"
[[ -f "$migration_file" ]] || fail "migration 010 is missing"
cutover_file="supabase/migrations/037_e4_phase_b_auth_cutover.sql"
[[ -f "$cutover_file" ]] || fail "migration 037 is missing"

bootstrap_id="$(sed -n "s/.*approved_advisor_user_id constant uuid := '\([^']*\)'.*/\1/p" "$migration_file" | head -n 1)"
cutover_id="$(sed -n "s/.*approved_advisor_user_id constant uuid := '\([^']*\)'.*/\1/p" "$cutover_file" | head -n 1)"
[[ "$bootstrap_id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "migration 010 advisor UUID is unavailable"
[[ "$cutover_id" =~ ^[0-9a-fA-F-]{36}$ ]] || fail "migration 037 advisor UUID is unavailable"

query="select exists (select 1 from supabase_migrations.schema_migrations where version = '010') as migration_010_applied, exists (select 1 from supabase_migrations.schema_migrations where version = '037') as migration_037_applied, exists (select 1 from auth.users where id = '$bootstrap_id'::uuid) as bootstrap_user_present, exists (select 1 from auth.users where id = '$cutover_id'::uuid) as cutover_user_present"
result="$(SUPABASE_TELEMETRY_DISABLED=1 $supabase_bin db query --linked --output-format json "$query")" || fail "remote Auth bootstrap check could not run"

migration_applied="$(printf '%s' "$result" | jq -r '.rows[0].migration_010_applied // false')"
bootstrap_present="$(printf '%s' "$result" | jq -r '.rows[0].bootstrap_user_present // false')"
cutover_applied="$(printf '%s' "$result" | jq -r '.rows[0].migration_037_applied // false')"
cutover_present="$(printf '%s' "$result" | jq -r '.rows[0].cutover_user_present // false')"

[[ "$migration_applied" == "true" || "$bootstrap_present" == "true" ]] || fail "the Auth bootstrap user required by migration 010 is absent; provision it through the approved Auth workflow before applying migrations"
[[ "$cutover_applied" == "true" || "$cutover_present" == "true" ]] || fail "the final advisor identity required by migration 037 is absent; provision it through the approved Auth workflow before the E4 cutover"

printf '%s\n' "Auth bootstrap preflight: PASS (required Auth identities and migration gates are present)"
