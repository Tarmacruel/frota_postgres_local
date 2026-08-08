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
  printf 'Uso: %s <commit-sha-de-40-caracteres>\n' "$0" >&2
  exit 64
}

[[ $# -eq 1 ]] || usage
commit_sha="$1"
[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || frota_die "SHA de release invalido"

frota_require_command docker
frota_require_command git
frota_require_command curl
frota_require_command flock

frota_load_runtime
frota_require_share_mount
repository_url="$(frota_env_value FROTA_GIT_REPOSITORY "$FROTA_ENV_FILE")"

mkdir -p "$FROTA_RELEASE_ROOT" "$FROTA_STATE_ROOT" "$FROTA_UPLOADS_DIR"
exec 9>"$FROTA_STATE_ROOT/release.lock"
flock -n 9 || frota_die "Ja existe uma publicacao do Frota em andamento"

remote_head="$(git ls-remote "$repository_url" refs/heads/main | awk 'NR == 1 { print $1 }')"
[[ "$remote_head" == "$commit_sha" ]] || frota_die "main avancou para outro commit; recusando publicar um SHA desatualizado"

candidate="$FROTA_RELEASE_ROOT/$commit_sha"
build_dir="$(mktemp -d "$FROTA_RELEASE_ROOT/.build-$commit_sha.XXXXXX")"
cleanup_build() {
  [[ -d "$build_dir" ]] && rm -rf -- "$build_dir"
}
trap cleanup_build EXIT

if [[ ! -d "$candidate" ]]; then
  git clone --quiet --depth 1 --branch main "$repository_url" "$build_dir"
  actual_commit="$(git -C "$build_dir" rev-parse HEAD)"
  [[ "$actual_commit" == "$commit_sha" ]] || frota_die "Checkout nao corresponde ao SHA solicitado"
  mv "$build_dir" "$candidate"
  build_dir=""
fi

previous_release="$(frota_state_value FROTA_CURRENT_RELEASE || true)"
previous_image="$(frota_state_value FROTA_CURRENT_IMAGE || true)"
export FROTA_APP_IMAGE="frota-app:$commit_sha"

printf 'Construindo imagem %s...\n' "$FROTA_APP_IMAGE"
frota_compose "$candidate" build --pull app

printf 'Garantindo PostgreSQL...\n'
frota_compose "$candidate" up -d postgres

printf 'Aplicando migrations...\n'
frota_compose "$candidate" --profile migration run --rm migrate

printf 'Trocando aplicacao...\n'
frota_compose "$candidate" up -d --no-deps --force-recreate app

if ! frota_wait_for_health 90; then
  printf 'Nova versao nao respondeu ao readiness. Tentando restaurar a versao anterior...\n' >&2
  if [[ -n "$previous_release" && -n "$previous_image" && -d "$previous_release" ]]; then
    export FROTA_APP_IMAGE="$previous_image"
    frota_compose "$previous_release" up -d --no-deps --force-recreate app
    frota_wait_for_health 90 || true
  fi
  frota_die "Deploy interrompido: readiness da nova versao falhou"
fi

frota_write_state "$candidate" "frota-app:$commit_sha" "$previous_release" "$previous_image"
frota_update_current_symlink "$candidate"

printf 'Deploy concluido: %s\n' "$commit_sha"
