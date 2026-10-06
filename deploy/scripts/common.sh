#!/usr/bin/env bash

set -euo pipefail

readonly FROTA_DEFAULT_ENV_FILE="/etc/frota/production.env"

frota_die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 1
}

frota_require_command() {
  command -v "$1" >/dev/null 2>&1 || frota_die "Comando obrigatorio nao encontrado: $1"
}

frota_env_value() {
  local key="$1"
  local env_file="$2"
  local value

  value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$env_file")"
  [[ -n "$value" ]] || frota_die "Variavel obrigatoria ausente em $env_file: $key"
  printf '%s' "$value"
}

frota_load_runtime() {
  export FROTA_ENV_FILE="${FROTA_ENV_FILE:-$FROTA_DEFAULT_ENV_FILE}"
  [[ -f "$FROTA_ENV_FILE" ]] || frota_die "Arquivo de ambiente nao encontrado: $FROTA_ENV_FILE"

  export FROTA_RELEASE_ROOT="$(frota_env_value FROTA_RELEASE_ROOT "$FROTA_ENV_FILE")"
  export FROTA_STATE_ROOT="$(frota_env_value FROTA_STATE_ROOT "$FROTA_ENV_FILE")"
  export FROTA_BACKUP_ROOT="$(frota_env_value FROTA_BACKUP_ROOT "$FROTA_ENV_FILE")"
  export FROTA_UPLOADS_DIR="$(frota_env_value FROTA_UPLOADS_DIR "$FROTA_ENV_FILE")"
  export FROTA_HEALTH_URL="$(frota_env_value FROTA_HEALTH_URL "$FROTA_ENV_FILE")"
}

frota_require_share_mount() {
  local path normalized_path

  frota_require_command mountpoint
  frota_require_command realpath
  mountpoint -q /mnt/frota-share || \
    frota_die "O compartilhamento SMB /mnt/frota-share nao esta montado; recusando usar o diretorio local como fallback"

  for path in "$FROTA_RELEASE_ROOT" "$FROTA_BACKUP_ROOT" "$FROTA_UPLOADS_DIR"; do
    normalized_path="$(realpath -m "$path")"
    case "$normalized_path" in
      /mnt/frota-share/*) ;;
      *) frota_die "Diretorio fora do compartilhamento SMB recusado: $path" ;;
    esac
  done
}

frota_state_file() {
  printf '%s/release-state.env' "$FROTA_STATE_ROOT"
}

frota_state_value() {
  local name="$1"
  local state_file
  state_file="$(frota_state_file)"
  [[ -f "$state_file" ]] || return 0
  awk -v key="$name" 'index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }' "$state_file"
}

frota_compose() {
  local release_dir="$1"
  shift

  [[ -f "$release_dir/deploy/compose.production.yml" ]] || frota_die "Compose ausente em $release_dir"
  docker compose \
    --project-directory "$release_dir" \
    --env-file "$FROTA_ENV_FILE" \
    -f "$release_dir/deploy/compose.production.yml" \
    "$@"
}

frota_wait_for_health() {
  local timeout_seconds="${1:-90}"
  local deadline=$((SECONDS + timeout_seconds))

  until curl --fail --silent --show-error "$FROTA_HEALTH_URL" >/dev/null; do
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 3
  done
}

frota_write_state() {
  local current_release="$1"
  local current_image="$2"
  local previous_release="$3"
  local previous_image="$4"
  local state_file temporary_file

  state_file="$(frota_state_file)"
  mkdir -p "$FROTA_STATE_ROOT"
  temporary_file="$(mktemp "$FROTA_STATE_ROOT/.release-state.XXXXXX")"
  chmod 0600 "$temporary_file"

  cat >"$temporary_file" <<EOF
FROTA_CURRENT_RELEASE=$current_release
FROTA_CURRENT_IMAGE=$current_image
FROTA_PREVIOUS_RELEASE=$previous_release
FROTA_PREVIOUS_IMAGE=$previous_image
FROTA_RELEASED_AT=$(date --iso-8601=seconds)
EOF

  mv -f "$temporary_file" "$state_file"
}

frota_update_current_symlink() {
  local release_dir="$1"
  local temporary_link="$FROTA_RELEASE_ROOT/.current.$$.tmp"

  ln -s "$release_dir" "$temporary_link"
  mv -Tf "$temporary_link" "$FROTA_RELEASE_ROOT/current"
}
