# Resumo de Setup Atual

O projeto foi consolidado para usar uma entrada operacional unica:

```powershell
.\FROTA_Iniciar.bat
```

## Fluxo recomendado

1. Abrir `FROTA_Iniciar.bat`.
2. Escolher `Preparar PostgreSQL local` quando for a primeira execucao ou quando o banco precisar ser verificado.
3. Escolher `Iniciar stack dev` para subir backend e frontend.
4. Usar `Status` e `Abrir logs` para diagnostico rapido.

## Scripts mantidos

- `FROTA_Iniciar.bat`
- `Diagnostico.ps1`
- `Configurar_Backup_Automatico.bat`
- `scripts\ops\frota.ps1`
- `scripts\start_local_postgres.ps1`
- `scripts\backup-local.ps1`
- `scripts\run-backup-automatico.ps1`

Atalhos antigos foram removidos para evitar caminhos quebrados e duplicacao.
