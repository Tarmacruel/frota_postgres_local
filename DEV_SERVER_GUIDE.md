# FROTAS - Ambiente de Desenvolvimento

O ambiente de desenvolvimento agora e operado pela Central Operacional.

## Abrir menu

```powershell
.\FROTA_Iniciar.bat
```

## Fluxos comuns

| Fluxo | Opcao no menu |
|---|---|
| Backend + frontend | Iniciar stack dev |
| Somente backend | Iniciar backend |
| Somente frontend | Iniciar frontend |
| Preparar banco local | Preparar PostgreSQL local |
| Parar processos | Parar ambiente |
| Ver portas/PIDs | Status |
| Abrir logs | Abrir logs |

## Portas padrao

```text
Backend:  8000
Frontend: 3001
Publicacao local: 80
PostgreSQL: 5432
```

## Execucao direta dos scripts internos

Use somente quando precisar depurar fora do menu:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-dev-server.ps1 -Port 8000
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-frontend-dev.ps1 -Port 3001
```

O frontend usa polling no Vite para funcionar bem no repositorio em unidade de rede.
