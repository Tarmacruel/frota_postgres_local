# Scripts do FROTAS

Este projeto agora usa uma raiz minima e uma central operacional unica.

## Entrada principal

| Arquivo | Funcao |
|---|---|
| `FROTA_Iniciar.bat` | Abre a Central Operacional do FROTAS |
| `Diagnostico.ps1` | Verifica saude basica do ambiente |
| `Configurar_Backup_Automatico.bat` | Instala/atualiza o backup automatico |
| `Configurar_Auto_Retomada.bat` | Instala/atualiza o watchdog de auto-retomada |

## Central Operacional

Execute `FROTA_Iniciar.bat` e escolha uma opcao no menu.

Acoes disponiveis:

| Acao | O que faz |
|---|---|
| Iniciar stack dev | Sobe backend em `:8000` e frontend em `:3001` |
| Iniciar backend | Sobe apenas FastAPI |
| Iniciar frontend | Sobe apenas Vite |
| Preparar PostgreSQL local | Garante banco local, migrations e seed |
| Publicar porta 80 | Builda frontend e sobe backend em `:80` |
| Parar ambiente | Encerra processos conhecidos do FROTAS |
| Status | Mostra portas, PIDs e caminhos de logs |
| Abrir logs | Abre `storage\logs` |
| Backup manual | Gera backup local e copia no OneDrive |
| Configurar backup automatico | Registra tarefa diaria 3x ao dia |
| Configurar auto-retomada | Cria runtime local e tarefa `FROTA Watchdog` |
| Executar watchdog agora | Roda uma verificacao manual do watchdog |
| Aplicar migrations | Executa `alembic upgrade heads` |
| Atualizar projeto | `git pull`, migrations e build |

## Scripts internos mantidos

| Arquivo | Uso |
|---|---|
| `scripts\ops\frota.ps1` | Menu e orquestracao principal |
| `scripts\ops\common.ps1` | Funcoes compartilhadas |
| `scripts\run-dev-server.ps1` | Backend dev |
| `scripts\run-frontend-dev.ps1` | Frontend dev |
| `scripts\start_local_postgres.ps1` | Bootstrap PostgreSQL local |
| `scripts\backup-local.ps1` | Backup manual local/espelhado |
| `scripts\run-backup-automatico.ps1` | Runner da tarefa agendada |
| `scripts\install-backup-automatico.ps1` | Instalador da tarefa agendada |
| `scripts\frota-watchdog.ps1` | Monitor e recuperador do app/tunel |
| `scripts\install-frota-watchdog.ps1` | Instalador do runtime local e tarefa agendada |
| `scripts\setup-remote-backend.ps1` | Setup para PostgreSQL remoto |

## Removidos

Atalhos antigos de raiz e scripts duplicados foram removidos. Use sempre `FROTA_Iniciar.bat` para iniciar, parar, publicar, migrar, verificar status e executar backups.
