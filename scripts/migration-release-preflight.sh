#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "Migration release preflight: $1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
supabase_bin="$repo_root/node_modules/.bin/supabase"
[[ -x "$supabase_bin" ]] || fail "local Supabase CLI is required; run npm ci"

scripts/assert-supabase-target.sh
SUPABASE_TELEMETRY_DISABLED=1 "$supabase_bin" migration list --linked
SUPABASE_TELEMETRY_DISABLED=1 "$supabase_bin" db push --dry-run --linked
printf '%s\n' 'Migration release preflight: PASS (no migration was applied)'
