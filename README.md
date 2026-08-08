# FROTAS

Sistema local de gestao de frota com backend FastAPI, frontend React/Vite e PostgreSQL.

## Como operar

Use a Central Operacional:

```powershell
.\FROTA_Iniciar.bat
```

Ela concentra as tarefas do projeto:

| Opcao | Funcao |
|---|---|
| Iniciar stack dev | Sobe backend e frontend |
| Preparar PostgreSQL local | Garante banco local, migrations e seed |
| Publicar porta 80 | Builda frontend e publica localmente |
| Parar ambiente | Encerra processos do FROTAS |
| Status | Mostra portas, PIDs e logs |
| Backup manual | Gera backup local e copia no OneDrive |
| Configurar backup automatico | Agenda backup 3x ao dia |
| Configurar auto-retomada | Instala watchdog legado para desenvolvimento/local |

## URLs padrao

```text
Frontend: http://localhost:3001
Backend:  http://localhost:8000
Swagger:  http://localhost:8000/docs
```

## Backup automatico

```powershell
.\Configurar_Backup_Automatico.bat
```

Destino local:

```text
storage\backups
```

Destino espelhado:

```text
C:\Users\078364\OneDrive\BACKUPS\FROTAS
```

## Auto-retomada legada

```powershell
.\Configurar_Auto_Retomada.bat
```

Execute como administrador apenas no ambiente legado/desenvolvimento, para permitir configuracao de recuperacao dos servicos Cloudflared e PostgreSQL.

O watchdog usa `C:\FROTAS\frota_runtime`, monitora backend `:8000`, frontend `:3000`, PostgreSQL e Cloudflared, e registra logs em:

```text
C:\FROTAS\frota_runtime\storage\logs\frota-watchdog.log
```

## Diagnostico

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Diagnostico.ps1
```

## Manual completo

O manual de uso da versão atual fica em:

```text
docs\manual_sistema_frotas.md
output\doc\manual_sistema_frotas.pdf
```

## Scripts internos

Os scripts operacionais ficam em `scripts\`. Para uso normal, prefira sempre `FROTA_Iniciar.bat`.

## Produção Docker

O deploy de produção passa a ser preparado para Docker em uma VM Linux do `SAD61SVR001`. O código, releases, uploads e backups ficam em `Z:\FROTAS`; o volume ativo do PostgreSQL fica local à VM Docker. O watchdog de `C:\FROTAS` não é usado em produção após o corte. Consulte o guia de implantação em `docs\deploy\docker-sad61svr001.md` antes de substituir o runtime legado.
