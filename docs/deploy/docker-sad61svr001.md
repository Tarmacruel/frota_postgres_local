# Deploy Docker no SAD61SVR001

Este guia substitui o runtime produtivo em `C:\FROTAS\frota_runtime`. O repositório, releases, uploads e backups permanecem no compartilhamento `Z:`; o PostgreSQL ativo permanece em um volume local da VM Linux.

## Layout definitivo

```text
Z:\FROTAS\frota_postgres_local      codigo-fonte e documentacao
Z:\FROTAS\frota_runtime\releases    checkout imutavel de cada SHA publicado
Z:\FROTAS\frota_runtime\uploads     anexos persistentes
Z:\FROTAS\frota_runtime\backups     dumps, arquivos e checksums
Z:\FROTAS\frota_runtime\artifacts   evidencias de ensaio e operacao
VM Linux:/var/lib/docker             imagens e volume ativo frota_postgres
VM Linux:/etc/frota/production.env   segredos, fora do Git e com modo 0600
VM Linux:/var/lib/frota               estado, locks e historico de release (sem dados de negocio)
```

Não monte `Z:` como diretório de dados do PostgreSQL. O volume `frota_postgres` é local à VM; código, releases, dumps e anexos ficam no compartilhamento. Os scripts de release, rollback e backup recusam executar se o mount CIFS não estiver ativo, para nunca gravar acidentalmente no ponto de montagem local.

## Preparação da VM

1. Crie a VM Ubuntu Server 24.04 LTS no `SAD61SVR001`, com 4 vCPU, 8 GB de RAM, 100 GB de disco local e reserva DHCP. No servidor, o script `deploy\windows\New-FrotaUbuntuVm.ps1` cria a VM Hyper-V e informa o MAC para a reserva; ele exige ISO Ubuntu, switch virtual e diretório local para o VHD.
2. Copie ou clone este repositório na VM temporariamente e execute, como `root`:

   ```bash
   ./deploy/ubuntu/bootstrap-frota-vm.sh /caminho/do/repositorio
   ```

3. Copie `deploy/production.env.example` para `/etc/frota/production.env`; gere segredos com `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`, codifique a senha do banco na `DATABASE_URL` e substitua `CHANGE_ME_VM_DHCP_RESERVATION_IP` pelo IP reservado da VM. Mantenha modo `0600` e proprietário `root`.
4. Crie `/etc/frota/smb-credentials` a partir do exemplo com uma conta SMB dedicada de menor privilégio, então habilite o mount e o timer:

   ```bash
   systemctl enable --now mnt-frota-share.mount frota-backup.timer
   ```

5. Execute `./deploy/ubuntu/configure-frota-firewall.sh <IP_DO_HOST_WINDOWS>` e habilite o UFW somente após conferir o acesso administrativo.

## Cloudflare e GitHub Actions

No Cloudflare Zero Trust, mantenha `frota.sirel.com.br` como HTTP para `http://<IP_DA_VM>:8000`. Crie também um hostname SSH para `ssh://<IP_DA_VM>:22`, protegido por uma política **Service Auth** exclusiva do deploy GitHub.

No ambiente GitHub `production`, cadastre os segredos abaixo:

```text
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
FROTA_DEPLOY_SSH_PRIVATE_KEY
FROTA_SSH_HOST
FROTA_SSH_USER
FROTA_SSH_KNOWN_HOSTS
```

Adicione a chave pública correspondente em `/home/frota-deploy/.ssh/authorized_keys` com a restrição exibida pelo bootstrap. Crie a variável de repositório `FROTA_DEPLOY_ENABLED=true` somente depois dos testes de infraestrutura; enquanto ela não existir, o workflow executa CI sem publicar.

## Migração e corte

1. Execute o ensaio completo antes do corte: gere um ZIP legado com `scripts/backup-local.ps1`, valide o SHA-256, importe uma cópia na VM isolada com `frota-import-legacy-backup --confirm-replace`, execute `frota-restore-rehearsal` e registre a revisão Alembic, contagens das tabelas de negócio e quantidade de arquivos. Use como baseline os tamanhos esperados de aproximadamente 34 MB para banco e 414 MB para anexos; qualquer divergência precisa ser investigada antes da janela.
2. Publique uma primeira release Docker sem trocar o Cloudflared.
3. Durante a janela de 30 minutos, pare o runtime antigo, crie o backup final e execute na VM:

   ```bash
   frota-import-legacy-backup --confirm-replace /mnt/frota-share/FROTAS/frota_runtime/backups/<backup>.zip
   ```

4. Valide `/api/health/ready`, login, cadastro e upload/download de anexos pelo IP da VM.
5. Troque a origem do hostname público no Cloudflare para a VM e valide `https://frota.sirel.com.br/api/health/ready`.
6. Mantenha o PostgreSQL e o runtime antigo em `C:` desligados, porém intactos, por sete dias.

O rollback de aplicação é `frota-rollback`. Ele não desfaz migrations nem gravações novas; após o corte, rollback de banco exige restaurar backup e pode descartar dados posteriores.

## Incidentes e rollback

- **Aplicação indisponível, PostgreSQL saudável:** consulte `docker compose ... logs app`, confirme `/api/health/ready` e execute `frota-rollback` para voltar a imagem anterior. Não execute downgrade Alembic.
- **Banco indisponível:** preserve os logs, não remova o volume `frota_postgres`, confirme espaço em disco e use apenas uma restauração ensaiada do backup mais recente quando a recuperação do volume não for possível.
- **Falha do SMB/OneDrive:** os scripts interrompem backup/release quando o mount some. Restabeleça CIFS, valide `mountpoint -q /mnt/frota-share`, execute um backup manual e confira o espelho OneDrive antes de encerrar o incidente.
- **Durante os sete dias de transição:** o watchdog e os scripts em `C:\FROTAS` são somente legado/desenvolvimento. Não os reative para a produção Docker; mantenha o runtime antigo parado e intacto para a contingência documentada.

## Backup e restauração

- A VM gera backups às 00:00, 12:00 e 19:00, com retenção de 10 cópias e SHA-256.
- No Windows, execute `deploy\windows\Install-FrotaDockerBackupMirrorTask.ps1` para espelhar ao OneDrive às 00:15, 12:15 e 19:15.
- Execute regularmente `frota-restore-rehearsal [arquivo.tar.gz]`; sem argumento, ele valida o backup mais recente, anexos e migrations em um PostgreSQL temporário.
