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

frota_require_command docker
frota_require_command flock
frota_require_command sha256sum
frota_require_command tar

frota_load_runtime
frota_require_share_mount
current_release="$(frota_state_value FROTA_CURRENT_RELEASE || true)"
current_image="$(frota_state_value FROTA_CURRENT_IMAGE || true)"
[[ -n "$current_release" && -d "$current_release" ]] || frota_die "Nenhuma release ativa para executar o backup"
[[ -n "$current_image" ]] || frota_die "Imagem da release atual ausente"
export FROTA_APP_IMAGE="$current_image"

retention_count="$(frota_env_value FROTA_BACKUP_RETENTION "$FROTA_ENV_FILE")"
[[ "$retention_count" =~ ^[1-9][0-9]*$ ]] || frota_die "FROTA_BACKUP_RETENTION invalido"

mkdir -p "$FROTA_BACKUP_ROOT" "$FROTA_STATE_ROOT" "$FROTA_UPLOADS_DIR"
exec 9>"$FROTA_STATE_ROOT/backup.lock"
flock -n 9 || frota_die "Ja existe um backup do Frota em andamento"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d "$FROTA_BACKUP_ROOT/.backup-$timestamp.XXXXXX")"
archive_path="$FROTA_BACKUP_ROOT/frota-backup-$timestamp.tar.gz"
archive_sha_path="$archive_path.sha256"

cleanup() {
  [[ -d "$work_dir" ]] && rm -rf -- "$work_dir"
}
trap cleanup EXIT

printf 'Exportando PostgreSQL...\n'
frota_compose "$current_release" exec -T postgres \
  pg_dump --username="$(frota_env_value POSTGRES_USER "$FROTA_ENV_FILE")" \
  --dbname="$(frota_env_value POSTGRES_DB "$FROTA_ENV_FILE")" \
  --format=custom \
  --no-owner \
  --no-privileges >"$work_dir/database.dump"

printf 'Arquivando anexos...\n'
tar --create --gzip --file="$work_dir/uploads.tar.gz" --directory="$FROTA_UPLOADS_DIR" .

cat >"$work_dir/metadata.json" <<EOF
{
  "system": "Frota PMTF",
  "generated_at": "$(date --iso-8601=seconds)",
  "release_image": "$current_image",
  "database_format": "pg_dump custom",
  "uploads_archive": "uploads.tar.gz"
}
EOF

(
  cd "$work_dir"
  sha256sum database.dump uploads.tar.gz metadata.json > SHA256SUMS
)

tar --create --gzip --file="$archive_path" --directory="$work_dir" database.dump uploads.tar.gz metadata.json SHA256SUMS
sha256sum "$archive_path" >"$archive_sha_path"

mapfile -t old_archives < <(
  find "$FROTA_BACKUP_ROOT" -maxdepth 1 -type f -name 'frota-backup-*.tar.gz' -printf '%T@ %p\n' |
    sort -rn |
    tail -n +"$((retention_count + 1))" |
    cut -d' ' -f2-
)
for old_archive in "${old_archives[@]:-}"; do
  [[ -n "$old_archive" ]] || continue
  rm -f -- "$old_archive" "$old_archive.sha256"
done

printf 'Backup concluido: %s\n' "$archive_path"
