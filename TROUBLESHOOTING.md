# FROTAS - Solucao de Problemas

## Comece pelo diagnostico

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Diagnostico.ps1
```

## PostgreSQL offline

Abra:

```powershell
.\FROTA_Iniciar.bat
```

Escolha `Preparar PostgreSQL local`.

## Backend nao abre

No menu, escolha `Status` e confira a porta `8000`.

Se houver processo travado, escolha `Parar ambiente` e depois `Iniciar backend` ou `Iniciar stack dev`.

Logs:

```text
storage\logs\frota-app.log
storage\logs\frota-app.error.log
```

## Frontend nao abre

No menu, escolha `Status` e confira a porta `3001`.

Se necessario, escolha `Parar ambiente` e depois `Iniciar stack dev`.

Logs:

```text
storage\logs\frota-frontend.log
storage\logs\frota-frontend.error.log
```

## Backup automatico

Para reinstalar a tarefa:

```powershell
.\Configurar_Backup_Automatico.bat
```

Para consultar a tarefa:

```powershell
schtasks /Query /TN "FROTA Backup Automatico" /FO LIST /V
```

## Auto-retomada

Para instalar ou atualizar:

```powershell
.\Configurar_Auto_Retomada.bat
```

Execute como administrador se o instalador precisar configurar recuperacao dos servicos Windows.

Para consultar a tarefa:

```powershell
schtasks /Query /TN "FROTA Watchdog" /FO LIST /V
```

Logs:

```text
C:\FROTAS\frota_runtime\storage\logs\frota-watchdog.log
```

## Arquivos antigos

Atalhos antigos foram removidos. Use `FROTA_Iniciar.bat` como entrada unica para operacoes do sistema.
