#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Execute como root.\n' >&2
  exit 1
fi

[[ $# -eq 1 ]] || {
  printf 'Uso: %s <IP-do-host-Windows-SAD61SVR001>\n' "$0" >&2
  exit 64
}

host_ip="$1"
if ! [[ "$host_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  printf 'IP IPv4 invalido: %s\n' "$host_ip" >&2
  exit 64
fi

command -v ufw >/dev/null 2>&1 || {
  apt-get update
  apt-get install -y ufw
}

ufw allow from "$host_ip" to any port 8000 proto tcp comment 'Cloudflared Windows para Frota'
ufw allow from "$host_ip" to any port 22 proto tcp comment 'Cloudflare Access SSH via host Windows'
printf 'Regras adicionadas. Revise "ufw status numbered" e habilite o UFW manualmente somente apos preservar o acesso administrativo.\n'
