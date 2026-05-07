# FROTAS - Inicio Rapido

## 1. Abrir a Central Operacional

```powershell
.\FROTA_Iniciar.bat
```

Use o menu para iniciar o sistema, preparar banco, parar servicos, ver status, abrir logs e fazer backup.

## 2. Primeira execucao ou banco local

No menu, escolha:

```text
Preparar PostgreSQL local
```

Essa opcao garante o PostgreSQL local, aplica migrations e carrega os dados iniciais.

## 3. Iniciar o sistema

No menu, escolha:

```text
Iniciar stack dev
```

URLs padrao:

```text
Frontend: http://localhost:3001
Backend:  http://localhost:8000
Swagger:  http://localhost:8000/docs
```

## 4. Backup

Para instalar o backup automatico:

```powershell
.\Configurar_Backup_Automatico.bat
```

Para backup manual local + OneDrive, use a opcao `Backup manual` na Central Operacional.

## 5. Diagnostico

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Diagnostico.ps1
```
