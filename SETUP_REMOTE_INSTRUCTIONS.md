# Setup com PostgreSQL remoto

Use a Central Operacional como entrada principal:

```powershell
.\FROTA_Iniciar.bat
```

Para configurar manualmente um backend apontando para PostgreSQL remoto, use o script interno:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-remote-backend.ps1 -PostgresHost "IP_OU_HOST" -PostgresPort 5432
```

Depois, abra `FROTA_Iniciar.bat` e escolha:

```text
Iniciar backend
```

ou:

```text
Iniciar stack dev
```

## Requisitos

- PostgreSQL acessivel pela rede.
- Banco `frota_db`.
- Usuario `frota_user`.
- Porta liberada no firewall.

Para operacao normal, prefira o menu em `FROTA_Iniciar.bat`.
