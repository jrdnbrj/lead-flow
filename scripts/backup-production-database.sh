#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly SCRIPT_NAME="leadflow-db-backup"
readonly CONFIG_FILE="${BACKUP_CONFIG_FILE:-/etc/leadflow/backup.env}"
readonly LOCK_FILE="${BACKUP_LOCK_FILE:-/run/leadflow-db-backup.lock}"
readonly TEMP_ROOT="${BACKUP_TEMP_ROOT:-/var/tmp}"
readonly RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-r2}"
readonly R2_PREFIX="${R2_PREFIX:-database}"
readonly RETENTION_COUNT=2
readonly EXPECTED_PROJECT_REF="qixdcdpihrckyhqvdvln"
readonly MIN_FREE_KB="${BACKUP_MIN_FREE_KB:-1048576}"
readonly PG_DUMP_IMAGE="${PG_DUMP_IMAGE:-postgres:17-alpine}"

started_at_epoch="$(date +%s)"
temp_dir=""
archive_path=""
checksum_path=""
remote_archive_path=""
remote_checksum_path=""
rclone_config_path=""
upload_attempted=0
remote_verified=0
published=0

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

fail() {
  log "status=FAIL reason=$*"
  exit 1
}

cleanup() {
  local exit_code=$?

  unset PGPASSWORD RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
  unset PGSSLMODE

  if [[ "$exit_code" -ne 0 && "$upload_attempted" -eq 1 && "$remote_verified" -eq 0 ]]; then
    if [[ -n "$remote_archive_path" ]]; then
      rclone_deletefile "$remote_archive_path" || log "status=WARNING cleanup=unverified_archive_delete_failed"
    fi
    if [[ -n "$remote_checksum_path" ]]; then
      rclone_deletefile "$remote_checksum_path" || log "status=WARNING cleanup=unverified_checksum_delete_failed"
    fi
  fi

  if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
    rm -rf -- "$temp_dir"
  fi

  if [[ "$exit_code" -eq 0 ]]; then
    log "status=PASS local_temp_cleanup=PASS duration_seconds=$(( $(date +%s) - started_at_epoch ))"
  elif [[ "$published" -eq 1 ]]; then
    log "status=WARNING backup_published=YES local_temp_cleanup=$([[ -z "$temp_dir" || ! -d "$temp_dir" ]] && printf PASS || printf FAIL) duration_seconds=$(( $(date +%s) - started_at_epoch ))"
  fi

  exit "$exit_code"
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required_command_missing=$1"
}

read_config_value() {
  local key="$1"
  awk -F= -v wanted="$key" '$1 == wanted {sub(/^[^=]*=/, "", $0); print; exit}' "$CONFIG_FILE"
}

run_pg_tool() {
  local tool="$1"
  shift
  docker run --rm --network host --env PGPASSWORD --env PGSSLMODE "$PG_DUMP_IMAGE" "$tool" "$@"
}

rclone_deletefile() {
  local object_path="$1"
  rclone deletefile --config "$rclone_config_path" --log-level ERROR --no-traverse "$object_path" >/dev/null 2>&1
}

rclone_object_size() {
  local object_path="$1"
  rclone lsl --config "$rclone_config_path" --log-level ERROR --no-traverse "$object_path" 2>/dev/null \
    | awk 'NF >= 4 {print $1; exit}'
}

validate_config() {
  [[ "$(id -u)" -eq 0 ]] || fail "must_run_as_root"
  [[ -r "$CONFIG_FILE" ]] || fail "config_missing=$CONFIG_FILE"
  [[ "$(stat -c '%a' "$CONFIG_FILE")" == "600" ]] || fail "config_permissions_must_be_600"
  [[ "$(stat -c '%U' "$CONFIG_FILE")" == "root" ]] || fail "config_owner_must_be_root"

  local key value
  for key in SUPABASE_DB_URL SUPABASE_DB_PASSWORD R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BACKUP_BUCKET R2_ENDPOINT; do
    value="$(read_config_value "$key")"
    [[ -n "$value" ]] || fail "config_value_missing=$key"
  done

  SUPABASE_DB_URL="$(read_config_value SUPABASE_DB_URL)"
  SUPABASE_DB_PASSWORD="$(read_config_value SUPABASE_DB_PASSWORD)"
  R2_ACCOUNT_ID="$(read_config_value R2_ACCOUNT_ID)"
  R2_ACCESS_KEY_ID="$(read_config_value R2_ACCESS_KEY_ID)"
  R2_SECRET_ACCESS_KEY="$(read_config_value R2_SECRET_ACCESS_KEY)"
  R2_BACKUP_BUCKET="$(read_config_value R2_BACKUP_BUCKET)"
  R2_ENDPOINT="$(read_config_value R2_ENDPOINT)"

  case "$SUPABASE_DB_URL" in
    *"$EXPECTED_PROJECT_REF"*|*pooler.supabase.com*) ;;
    *) fail "database_target_is_not_expected_supabase_project" ;;
  esac
  case "$SUPABASE_DB_URL" in
    postgresql://*:*@*) fail "database_url_must_not_embed_password" ;;
  esac
  [[ "$R2_BACKUP_BUCKET" == "leadflow-backups" ]] || fail "unexpected_r2_bucket"
  [[ "$R2_ENDPOINT" == https://*.r2.cloudflarestorage.com ]] || fail "unexpected_r2_endpoint"
  [[ "$R2_ENDPOINT" == *"$R2_ACCOUNT_ID"* ]] || fail "r2_endpoint_account_mismatch"

  export PGPASSWORD="$SUPABASE_DB_PASSWORD"
  export PGSSLMODE=require
}

validate_disk() {
  local available_kb
  available_kb="$(df -Pk "$TEMP_ROOT" | awk 'NR == 2 {print $4}')"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || fail "could_not_measure_temp_disk"
  (( available_kb >= MIN_FREE_KB )) || fail "insufficient_temp_disk_kb=$available_kb"
  log "disk_check=PASS available_kb=$available_kb"
}

dump_database() {
  mkdir -p "$TEMP_ROOT"
  temp_dir="$(mktemp -d "$TEMP_ROOT/leadflow-db-backup.XXXXXXXX")"
  chmod 700 "$temp_dir"
  rclone_config_path="$temp_dir/rclone.conf"
  printf '%s\n' \
    '[r2]' \
    'type = s3' \
    'provider = Other' \
    'env_auth = false' \
    "access_key_id = $R2_ACCESS_KEY_ID" \
    "secret_access_key = $R2_SECRET_ACCESS_KEY" \
    "endpoint = $R2_ENDPOINT" \
    'region = auto' \
    'no_check_bucket = true' \
    >"$rclone_config_path"
  chmod 600 "$rclone_config_path"

  log "database_dump=START project_ref=$EXPECTED_PROJECT_REF"
  if ! run_pg_tool pg_dumpall --dbname="$SUPABASE_DB_URL" --roles-only --no-role-passwords >"$temp_dir/roles.sql" 2>"$temp_dir/roles.stderr"; then
    fail "roles_dump_failed"
  fi
  if ! run_pg_tool pg_dump --dbname="$SUPABASE_DB_URL" --schema-only --schema=public --no-owner >"$temp_dir/schema.sql" 2>"$temp_dir/schema.stderr"; then
    fail "schema_dump_failed"
  fi
  if ! run_pg_tool pg_dump --dbname="$SUPABASE_DB_URL" --data-only --schema=public --no-owner >"$temp_dir/data.sql" 2>"$temp_dir/data.stderr"; then
    fail "data_dump_failed"
  fi

  printf '%s\n' \
    "source_project_ref=$EXPECTED_PROJECT_REF" \
    "created_at_guayaquil=$(TZ=America/Guayaquil date --iso-8601=seconds)" \
    "created_at_utc=$(date -u --iso-8601=seconds)" \
    "components=roles.sql,schema.sql,data.sql" \
    "scope=public_application_schema_and_postgres_roles" \
    >"$temp_dir/manifest.txt"

  log "database_dump=PASS"
}

validate_archive() {
  local required_file
  for required_file in roles.sql schema.sql data.sql manifest.txt; do
    [[ -s "$temp_dir/$required_file" ]] || fail "dump_component_missing_or_empty=$required_file"
  done

  archive_path="$temp_dir/$archive_name"
  checksum_path="$temp_dir/$checksum_name"
  tar -C "$temp_dir" -czf "$archive_path" roles.sql schema.sql data.sql manifest.txt || fail "archive_create_failed"
  gzip -t "$archive_path" || fail "gzip_integrity_failed"

  local listed_files
  listed_files="$(tar -tzf "$archive_path")"
  for required_file in roles.sql schema.sql data.sql manifest.txt; do
    grep -Fxq "$required_file" <<<"$listed_files" || fail "archive_component_missing=$required_file"
  done
  tar -xOzf "$archive_path" schema.sql >"$temp_dir/schema.archive-check" || fail "schema_archive_extract_failed"
  tar -xOzf "$archive_path" data.sql >"$temp_dir/data.archive-check" || fail "data_archive_extract_failed"
  grep -q '[^[:space:]]' "$temp_dir/schema.archive-check" || fail "schema_dump_structurally_empty"
  grep -Eq '^(SET|SELECT pg_catalog|COPY|INSERT|BEGIN|COMMIT|--)' "$temp_dir/data.archive-check" || fail "data_dump_structurally_invalid"

  local archive_sha archive_size
  archive_sha="$(sha256sum "$archive_path" | awk '{print $1}')"
  archive_size="$(stat -c '%s' "$archive_path")"
  printf '%s  %s\n' "$archive_sha" "$archive_name" >"$checksum_path"
  (cd "$temp_dir" && sha256sum -c "$checksum_name" >/dev/null) || fail "local_checksum_verification_failed"
  log "archive_validation=PASS archive=$archive_name size_bytes=$archive_size sha256=$archive_sha"
}

upload_and_verify() {
  local local_size remote_size remote_checksum
  remote_archive_path="$RCLONE_REMOTE_NAME:$R2_BACKUP_BUCKET/$R2_PREFIX/$archive_name"
  remote_checksum_path="$RCLONE_REMOTE_NAME:$R2_BACKUP_BUCKET/$R2_PREFIX/$checksum_name"
  upload_attempted=1

  log "r2_upload=START object=$R2_PREFIX/$archive_name"
  rclone copyto --config "$rclone_config_path" --log-level ERROR --no-traverse --retries 3 --low-level-retries 10 "$archive_path" "$remote_archive_path" \
    || fail "archive_upload_failed"
  rclone copyto --config "$rclone_config_path" --log-level ERROR --no-traverse --retries 3 --low-level-retries 10 "$checksum_path" "$remote_checksum_path" \
    || fail "checksum_upload_failed"

  local_size="$(stat -c '%s' "$archive_path")"
  remote_size="$(rclone_object_size "$remote_archive_path")"
  [[ -n "$remote_size" ]] || fail "remote_archive_not_found_after_upload"
  [[ "$local_size" == "$remote_size" ]] || fail "remote_archive_size_mismatch"
  remote_checksum="$(rclone cat --config "$rclone_config_path" --log-level ERROR "$remote_checksum_path" 2>/dev/null | awk '{print $1; exit}')"
  [[ "$remote_checksum" == "$(sha256sum "$archive_path" | awk '{print $1}')" ]] || fail "remote_checksum_mismatch"

  remote_verified=1
  published=1
  log "r2_upload=PASS remote_object_exists=YES remote_size_valid=YES checksum_sidecar=VERIFIED"
}

rotate_remote_backups() {
  local remote_dir="$RCLONE_REMOTE_NAME:$R2_BACKUP_BUCKET/$R2_PREFIX"
  local archive_file checksum_file
  local -a archives=()
  local -a successful_archives=()

  mapfile -t archives < <(rclone lsf --config "$rclone_config_path" --log-level ERROR --files-only --format p "$remote_dir" 2>/dev/null \
    | awk '/^leadflow-db-[0-9]{8}-[0-9]{6}-ECT\.tar\.gz$/' | sort)

  for archive_file in "${archives[@]}"; do
    checksum_file="${archive_file%.tar.gz}.sha256"
    if [[ -n "$(rclone lsf --config "$rclone_config_path" --log-level ERROR --files-only --format p "$remote_dir/$checksum_file" 2>/dev/null)" ]]; then
      successful_archives+=("$archive_file")
    fi
  done

  local successful_count="${#successful_archives[@]}"
  log "retention=CHECK successful_backups=$successful_count keep_latest=$RETENTION_COUNT"
  (( successful_count > RETENTION_COUNT )) || return 0

  local delete_count=$((successful_count - RETENTION_COUNT))
  local index=0
  while (( index < delete_count )); do
    archive_file="${successful_archives[$index]}"
    checksum_file="${archive_file%.tar.gz}.sha256"
    log "retention=DELETE object=$R2_PREFIX/$archive_file"
    rclone deletefile --config "$rclone_config_path" --log-level ERROR --no-traverse "$remote_dir/$archive_file" \
      || { log "status=WARNING retention_cleanup=FAILED object=$R2_PREFIX/$archive_file"; return 2; }
    rclone deletefile --config "$rclone_config_path" --log-level ERROR --no-traverse "$remote_dir/$checksum_file" \
      || { log "status=WARNING retention_cleanup=FAILED object=$R2_PREFIX/$checksum_file"; return 2; }
    index=$((index + 1))
  done
  log "retention=PASS kept_latest=$RETENTION_COUNT"
}

main() {
  require_command awk
  require_command date
  require_command df
  require_command flock
  require_command gzip
  require_command grep
  require_command mktemp
  require_command docker
  require_command rclone
  require_command sha256sum
  require_command stat
  require_command tar

  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "another_backup_is_running"

  validate_config
  validate_disk

  local timestamp
  timestamp="$(TZ=America/Guayaquil date +%Y%m%d-%H%M%S)"
  archive_name="leadflow-db-${timestamp}-ECT.tar.gz"
  checksum_name="leadflow-db-${timestamp}-ECT.sha256"

  dump_database
  validate_archive
  upload_and_verify
  rotate_remote_backups || exit $?
}

main "$@"
