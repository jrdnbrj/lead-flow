#!/usr/bin/env bash
set -euo pipefail

rollback_commit="${1:-${ROLLBACK_COMMIT:-}}"
if [[ -z "$rollback_commit" ]]; then
  printf '%s\n' 'Usage: scripts/rollback-production.sh <known-good-commit>' >&2
  exit 64
fi

DEPLOY_COMMIT="$rollback_commit" "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy-production.sh"
