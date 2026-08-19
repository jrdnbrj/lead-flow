#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "Production deploy: $1" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

command -v docker >/dev/null 2>&1 || fail "docker is required"
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"

deploy_commit="${DEPLOY_COMMIT:-${1:-origin/main}}"
env_dir="${DEPLOY_ENV_DIR:-/etc/leadflow}"
leadflow_env_file="${LEADFLOW_ENV_FILE:-$env_dir/leadflow.env}"
evolution_env_file="${EVOLUTION_ENV_FILE:-$env_dir/evolution.env}"
caddy_env_file="${CADDY_ENV_FILE:-$env_dir/caddy.env}"
ghcr_env_file="${GHCR_ENV_FILE:-$env_dir/ghcr.env}"
compose_file="${COMPOSE_FILE:-$repo_root/docker-compose.production.yml}"
project_name="${COMPOSE_PROJECT_NAME:-leadflow-production}"
image_repository="${LEADFLOW_IMAGE_REPOSITORY:-ghcr.io/jrdnbrj/lead-flow}"
temporary_docker_config=""

[[ -f "$compose_file" ]] || fail "production compose file is missing"
for env_file in "$leadflow_env_file" "$evolution_env_file" "$caddy_env_file"; do
  [[ -r "$env_file" ]] || fail "environment file is not readable: $env_file"
done

if [[ -n "$(git status --porcelain)" ]]; then
  fail "working tree is not clean; refusing to overwrite local server changes"
fi

git fetch --prune origin main
target_commit="$(git rev-parse --verify "$deploy_commit^{commit}")" || fail "requested commit is not available: $deploy_commit"
git cat-file -e "$target_commit^{commit}" || fail "requested commit is not a valid commit"
git checkout --detach "$target_commit" >/dev/null

set -a
# shellcheck disable=SC1090
source "$leadflow_env_file"
# shellcheck disable=SC1090
source "$evolution_env_file"
# shellcheck disable=SC1090
source "$caddy_env_file"
set +a

required_vars=(
  LEADFLOW_ENVIRONMENT
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  NEXT_PUBLIC_VAPID_PUBLIC_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  EVOLUTION_API_KEY
  EVOLUTION_API_INSTANCE_NAME
  EVOLUTION_WEBHOOK_URL
  EVOLUTION_WEBHOOK_TOKEN
  EVOLUTION_DATABASE_URL
  CADDY_HOSTNAME
  ACME_EMAIL
)
for variable in "${required_vars[@]}"; do
  [[ -n "${!variable:-}" ]] || fail "$variable is required"
done
[[ "$LEADFLOW_ENVIRONMENT" == "production" ]] || fail "LEADFLOW_ENVIRONMENT must be production"

export LEADFLOW_IMAGE_REPOSITORY="$image_repository"
export LEADFLOW_IMAGE_TAG="$target_commit"

if [[ -r "$ghcr_env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ghcr_env_file"
  set +a
fi

if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_READ_TOKEN:-}" ]]; then
  temporary_docker_config="$(mktemp -d)"
  chmod 700 "$temporary_docker_config"
  trap 'rm -rf "$temporary_docker_config"' EXIT
  export DOCKER_CONFIG="$temporary_docker_config"
  printf '%s\n' "$GHCR_READ_TOKEN" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin >/dev/null \
    || fail "could not authenticate to GHCR"
fi

compose=(
  env
  "LEADFLOW_IMAGE_REPOSITORY=$image_repository"
  "LEADFLOW_IMAGE_TAG=$target_commit"
  docker compose
  --project-name "$project_name"
  -f "$compose_file"
)
docker pull "$image_repository:$target_commit" >/dev/null \
  || fail "could not pull LeadFlow image $image_repository:$target_commit"
"${compose[@]}" up -d --no-build

wait_for_health() {
  local service="$1"
  local deadline=$((SECONDS + ${DEPLOY_HEALTH_TIMEOUT_SECONDS:-240}))
  local container_id status
  while (( SECONDS < deadline )); do
    container_id="$("${compose[@]}" ps -q "$service")"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$status" == "healthy" ]]; then
        return 0
      fi
    fi
    sleep 3
  done
  printf '%s\n' "Container health did not become ready: $service" >&2
  "${compose[@]}" ps >&2 || true
  return 1
}

for service in evolution-redis evolution-api leadflow caddy; do
  wait_for_health "$service"
done

wait_for_endpoint() {
  local endpoint="$1"
  local deadline=$((SECONDS + ${DEPLOY_HEALTH_TIMEOUT_SECONDS:-240}))

  printf 'Waiting for LeadFlow endpoint: %s\n' "$endpoint"
  while (( SECONDS < deadline )); do
    if "${compose[@]}" exec -T leadflow wget \
      --no-verbose \
      --tries=1 \
      --spider \
      "$endpoint" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done

  printf '%s\n' "LeadFlow endpoint did not become ready: $endpoint" >&2
  "${compose[@]}" logs --tail=80 leadflow >&2 || true
  return 1
}

wait_for_endpoint http://127.0.0.1:3000/api/health
wait_for_endpoint http://127.0.0.1:3000/api/ready

printf 'Production deploy: PASS (%s)\n' "$target_commit"
printf '%s\n' 'Rollback images are retained; no image prune was performed.'
