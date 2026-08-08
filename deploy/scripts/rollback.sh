#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$script_dir/common.sh" ]]; then
  # shellcheck source=common.sh
  source "$script_dir/common.sh"
else
  # shellcheck source=/usr/local/lib/frota/common.sh
  source /usr/local/lib/frota/common.sh
fi

frota_require_command docker
frota_require_command curl
frota_require_command flock
frota_load_runtime
frota_require_share_mount

mkdir -p "$FROTA_STATE_ROOT"
exec 9>"$FROTA_STATE_ROOT/release.lock"
flock -n 9 || frota_die "Ja existe uma publicacao do Frota em andamento"

current_release="$(frota_state_value FROTA_CURRENT_RELEASE || true)"
current_image="$(frota_state_value FROTA_CURRENT_IMAGE || true)"
previous_release="$(frota_state_value FROTA_PREVIOUS_RELEASE || true)"
previous_image="$(frota_state_value FROTA_PREVIOUS_IMAGE || true)"

[[ -n "$previous_release" && -n "$previous_image" && -d "$previous_release" ]] || \
  frota_die "Nao existe uma versao anterior disponivel para rollback"

export FROTA_APP_IMAGE="$previous_image"
printf 'Restaurando aplicacao %s...\n' "$previous_image"
frota_compose "$previous_release" up -d --no-deps --force-recreate app
frota_wait_for_health 90 || frota_die "A versao anterior nao respondeu ao readiness"

frota_write_state "$previous_release" "$previous_image" "$current_release" "$current_image"
frota_update_current_symlink "$previous_release"

printf 'Rollback de aplicacao concluido. O schema PostgreSQL nao foi revertido.\n'
