#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Execute este bootstrap como root.\n' >&2
  exit 1
fi

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
[[ -f "$repo_root/deploy/compose.production.yml" ]] || {
  printf 'Repositorio Frota invalido: %s\n' "$repo_root" >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl cifs-utils git openssh-server rsync sudo tar unzip

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  >/etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker.service

id -u frota-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash frota-deploy
install -d -m 0700 -o frota-deploy -g frota-deploy /home/frota-deploy/.ssh
install -d -m 0750 /etc/frota /var/lib/frota /mnt/frota-share /usr/local/lib/frota

install -m 0755 "$repo_root/deploy/scripts/release.sh" /usr/local/sbin/frota-release
install -m 0755 "$repo_root/deploy/scripts/rollback.sh" /usr/local/sbin/frota-rollback
install -m 0755 "$repo_root/deploy/scripts/backup.sh" /usr/local/sbin/frota-backup
install -m 0755 "$repo_root/deploy/scripts/restore-rehearsal.sh" /usr/local/sbin/frota-restore-rehearsal
install -m 0755 "$repo_root/deploy/scripts/import-legacy-backup.sh" /usr/local/sbin/frota-import-legacy-backup
install -m 0755 "$repo_root/deploy/scripts/frota-ssh-command" /usr/local/sbin/frota-ssh-command
install -m 0644 "$repo_root/deploy/scripts/common.sh" /usr/local/lib/frota/common.sh

install -m 0644 "$repo_root/deploy/systemd/mnt-frota-share.mount" /etc/systemd/system/mnt-frota-share.mount
install -m 0644 "$repo_root/deploy/systemd/frota-backup.service" /etc/systemd/system/frota-backup.service
install -m 0644 "$repo_root/deploy/systemd/frota-backup.timer" /etc/systemd/system/frota-backup.timer

if [[ ! -f /etc/frota/production.env ]]; then
  install -m 0600 "$repo_root/deploy/production.env.example" /etc/frota/production.env
fi

if [[ ! -f /etc/frota/smb-credentials ]]; then
  cat >/etc/frota/smb-credentials.example <<'EOF'
username=FROTA_SMB_SERVICE_ACCOUNT
password=CHANGE_ME
domain=OPTIONAL_DOMAIN
EOF
  chmod 0600 /etc/frota/smb-credentials.example
fi

cat >/etc/sudoers.d/frota-deploy <<'EOF'
frota-deploy ALL=(root) NOPASSWD: /usr/local/sbin/frota-release *, /usr/local/sbin/frota-rollback
EOF
chmod 0440 /etc/sudoers.d/frota-deploy
visudo -cf /etc/sudoers.d/frota-deploy

cat >/etc/ssh/sshd_config.d/90-frota-deploy.conf <<'EOF'
Match User frota-deploy
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    AllowTcpForwarding no
    X11Forwarding no
EOF
sshd -t
systemctl reload ssh

systemctl daemon-reload
systemctl enable frota-backup.timer

cat <<'EOF'
Bootstrap concluido.

Antes de iniciar o Frota:
  1. Preencha /etc/frota/production.env com segredos e o IP do host Windows.
  2. Copie /etc/frota/smb-credentials.example para /etc/frota/smb-credentials e informe a conta SMB dedicada.
  3. Adicione a chave publica do GitHub Actions em /home/frota-deploy/.ssh/authorized_keys com:
       command="/usr/local/sbin/frota-ssh-command",no-port-forwarding,no-agent-forwarding,no-pty <CHAVE>
  4. Execute systemctl enable --now mnt-frota-share.mount frota-backup.timer.
  5. Valide docker info, o mount SMB e o firewall antes do primeiro deploy.
EOF
