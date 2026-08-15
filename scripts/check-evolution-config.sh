#!/usr/bin/env bash
set -euo pipefail

missing=()
[[ -n "${EVOLUTION_API_URL:-}" ]] || missing+=(EVOLUTION_API_URL)
[[ -n "${EVOLUTION_API_INSTANCE_NAME:-}" ]] || missing+=(EVOLUTION_API_INSTANCE_NAME)
[[ -n "${EVOLUTION_API_KEY:-}" ]] || missing+=(EVOLUTION_API_KEY)

if ((${#missing[@]} > 0)); then
  printf '%s\n' "missing Evolution configuration: ${missing[*]}" >&2
  exit 1
fi

printf '%s\n' "Evolution configuration present (API key omitted)"
