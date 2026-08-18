#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# These are the current blocking contract checks. E2-S7/S8 and E6-S3/S4
# retain legacy assertions that are tracked separately until their contracts
# are updated to the accepted current implementation. E4-S5b requires a
# local PostgreSQL fixture and is not a pure CI source check.
checks=(
  scripts/e1-s6-s7-action-contract-check.mjs
  scripts/e1-s8-action-adapter-contract-check.mjs
  scripts/e1-s9-s11-ui-contract-check.mjs
  scripts/e1-scheduling-stage-contract-check.mjs
  scripts/e2-s1-s2-s3-s4-contract-check.mjs
  scripts/e2-s5-s6-contract-check.mjs
  scripts/e2-s9-ui-contract-check.mjs
  scripts/e3-batch1-contract-check.mjs
  scripts/e3-batch2-contract-check.mjs
  scripts/e3-batch3-contract-check.mjs
  scripts/e3-batch4-contract-check.mjs
  scripts/e3-integrated-contract-check.mjs
  scripts/e4-s3-auth-contract-check.mjs
  scripts/e4-s4-backfill-dry-run-contract.mjs
  scripts/e4-s5a-event-contract-check.mjs
  scripts/e4-s6-webhook-contract-check.mjs
  scripts/e5-batch1-contract-check.mjs
  scripts/e5-batch2-contract-check.mjs
  scripts/e5-integrated-contract-check.mjs
  scripts/e5-push-runtime-contract-check.mjs
  scripts/e6-integrated-contract-check.mjs
  scripts/e6-s1-s2-contract-check.mjs
)

for check in "${checks[@]}"; do
  node "$check"
done

printf '%s\n' 'CI contract checks: PASS'
