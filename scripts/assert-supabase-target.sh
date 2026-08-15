#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "Supabase target guard: $1" >&2
  exit 1
}

[[ -n "${LEADFLOW_ENVIRONMENT:-}" ]] || fail "LEADFLOW_ENVIRONMENT is required"
[[ -n "${SUPABASE_PROJECT_REF:-}" ]] || fail "SUPABASE_PROJECT_REF is required"

# If local Supabase configuration declares a project identity, it must agree
# with the explicit environment value. An unknown identity fails closed.
config_file="supabase/config.toml"
if [[ -f "$config_file" ]]; then
  linked_ref="$(sed -n 's/^project_id *= *"\([^"]*\)".*$/\1/p' "$config_file" | head -n 1)"
  [[ -n "$linked_ref" ]] || fail "local Supabase project identity is unavailable"
  [[ "$linked_ref" == "$SUPABASE_PROJECT_REF" ]] || fail "local Supabase project identity does not match SUPABASE_PROJECT_REF"
fi

printf '%s\n' "Supabase target guard: PASS (identity verified)"

# Remote mutating operations still require explicit user authorization.
# TODO: restore a multi-environment guard if LeadFlow gains separate environments.
