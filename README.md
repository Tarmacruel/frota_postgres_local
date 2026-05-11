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
