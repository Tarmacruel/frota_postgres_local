#!/usr/bin/env bash

set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$script_dir/common.sh" ]]; then
  # shellcheck source=common.sh
  source "$script_dir/common.sh"
else
  # shellcheck source=/usr/local/lib/frota/common.sh
  source /usr/local/lib/frota/common.sh
fi

usage() {
  printf 'Uso: %s --confirm-replace <backup-legado.zip>\n' "$0" >&2
  exit 64
}

[[ $# -eq 2 && "$1" == "--confirm-replace" ]] || usage
legacy_archive="$2"
[[ -f "$legacy_archive" ]] || frota_die "Backup legado nao encontrado: $legacy_archive"

frota_require_command docker
frota_require_command unzip
frota_require_command rsync
frota_load_runtime
frota_require_share_mount

current_release="$(frota_state_value FROTA_CURRENT_RELEASE || true)"
current_image="$(frota_state_value FROTA_CURRENT_IMAGE || true)"
[[ -n "$current_release" && -d "$current_release" && -n "$current_image" ]] || \
  frota_die "Crie a primeira release Docker antes de importar o backup legado"
export FROTA_APP_IMAGE="$current_image"

work_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

unzip -q "$legacy_archive" -d "$work_dir"
sql_path="$(find "$work_dir" -type f -name database.sql -print -quit)"
[[ -n "$sql_path" ]] || frota_die "database.sql ausente no backup legado"

postgres_db="$(frota_env_value POSTGRES_DB "$FROTA_ENV_FILE")"
postgres_user="$(frota_env_value POSTGRES_USER "$FROTA_ENV_FILE")"

printf 'Parando aplicacao durante a restauracao...\n'
frota_compose "$current_release" stop app

printf 'Recriando banco de dados Docker...\n'
frota_compose "$current_release" exec -T postgres \
  psql --username="$postgres_user" --dbname=postgres --set=ON_ERROR_STOP=1 \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$postgres_db' AND pid <> pg_backend_pid();" \
  --command="DROP DATABASE IF EXISTS \"$postgres_db\";" \
  --command="CREATE DATABASE \"$postgres_db\" OWNER \"$postgres_user\";"

cat "$sql_path" | frota_compose "$current_release" exec -T postgres \
  psql --username="$postgres_user" --dbname="$postgres_db" --set=ON_ERROR_STOP=1

legacy_storage="$(find "$work_dir" -type d -name storage -print -quit)"
if [[ -n "$legacy_storage" ]]; then
  printf 'Copiando anexos do backup legado...\n'
  mkdir -p "$FROTA_UPLOADS_DIR"
  rsync -a "$legacy_storage/" "$FROTA_UPLOADS_DIR/"
fi

printf 'Aplicando migrations atuais...\n'
frota_compose "$current_release" --profile migration run --rm migrate
frota_compose "$current_release" up -d app
frota_wait_for_health 90 || frota_die "Aplicacao nao respondeu apos a importacao"

revision="$(frota_compose "$current_release" exec -T postgres psql --username="$postgres_user" --dbname="$postgres_db" --tuples-only --no-align --command 'SELECT version_num FROM alembic_version')"
printf 'Importacao concluida. Revision Alembic: %s\n' "$revision"
