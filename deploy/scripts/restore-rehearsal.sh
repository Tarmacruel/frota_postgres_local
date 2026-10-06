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
frota_require_command sha256sum
frota_require_command tar

frota_load_runtime
frota_require_share_mount
current_image="$(frota_state_value FROTA_CURRENT_IMAGE || true)"
[[ -n "$current_image" ]] || frota_die "Nenhuma imagem de release ativa para ensaiar a restauracao"

archive_path="${1:-}"
if [[ -z "$archive_path" ]]; then
  archive_path="$(find "$FROTA_BACKUP_ROOT" -maxdepth 1 -type f -name 'frota-backup-*.tar.gz' -printf '%T@ %p\n' | sort -rn | head -n1 | cut -d' ' -f2-)"
fi
[[ -n "$archive_path" && -f "$archive_path" ]] || frota_die "Backup nao encontrado"

work_dir="$(mktemp -d)"
suffix="$(date +%s)"
network_name="frota-rehearsal-$suffix"
volume_name="frota_rehearsal_$suffix"
database_container="frota-rehearsal-db-$suffix"

cleanup() {
  docker rm -f "$database_container" >/dev/null 2>&1 || true
  docker network rm "$network_name" >/dev/null 2>&1 || true
  docker volume rm "$volume_name" >/dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

tar --extract --gzip --file="$archive_path" --directory="$work_dir"
(
  cd "$work_dir"
  sha256sum --check SHA256SUMS
)
tar --list --gzip --file="$work_dir/uploads.tar.gz" >/dev/null

postgres_db="$(frota_env_value POSTGRES_DB "$FROTA_ENV_FILE")"
postgres_user="$(frota_env_value POSTGRES_USER "$FROTA_ENV_FILE")"
postgres_password="$(frota_env_value POSTGRES_PASSWORD "$FROTA_ENV_FILE")"

docker network create "$network_name" >/dev/null
docker volume create "$volume_name" >/dev/null
docker run --detach --rm \
  --name "$database_container" \
  --network "$network_name" \
  --volume "$volume_name:/var/lib/postgresql/data" \
  --env "POSTGRES_DB=$postgres_db" \
  --env "POSTGRES_USER=$postgres_user" \
  --env "POSTGRES_PASSWORD=$postgres_password" \
  postgres:16.13-bookworm >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$database_container" pg_isready -U "$postgres_user" -d "$postgres_db" >/dev/null; then
    break
  fi
  sleep 2
done
docker exec "$database_container" pg_isready -U "$postgres_user" -d "$postgres_db" >/dev/null || \
  frota_die "PostgreSQL temporario nao ficou pronto"

docker cp "$work_dir/database.dump" "$database_container:/tmp/database.dump"
docker exec "$database_container" pg_restore \
  --username="$postgres_user" \
  --dbname="$postgres_db" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  /tmp/database.dump

rehearsal_env="$work_dir/rehearsal.env"
sed "s/@postgres:5432\//@$database_container:5432\//" "$FROTA_ENV_FILE" >"$rehearsal_env"
docker run --rm \
  --network "$network_name" \
  --env-file "$rehearsal_env" \
  "$current_image" \
  alembic upgrade head

revision="$(docker exec "$database_container" psql --username="$postgres_user" --dbname="$postgres_db" --tuples-only --no-align --command 'SELECT version_num FROM alembic_version')"
printf 'Ensaio de restauracao concluido. Revision Alembic: %s\n' "$revision"
