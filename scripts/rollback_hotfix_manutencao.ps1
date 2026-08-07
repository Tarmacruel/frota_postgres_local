[CmdletBinding()]
param(
    [string]$RepoRoot = "Z:\FROTAS\frota_postgres_local",
    [int]$PublicPort = 80,
    [switch]$Restart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$TargetFile = Join-Path $RepoRoot "backend\app\services\maintenance_service.py"
$BackupDir = Join-Path $RepoRoot "storage\hotfix-backups"

if (-not (Test-Path -LiteralPath $BackupDir)) {
    throw "Diretorio de backups nao encontrado: $BackupDir"
}

$Backup = Get-ChildItem -LiteralPath $BackupDir -Filter "maintenance_service.py.*.bak" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $Backup) {
    throw "Nenhum backup do maintenance_service.py foi encontrado."
}

Write-Host "Restaurando: $($Backup.FullName)" -ForegroundColor Cyan
Copy-Item -LiteralPath $Backup.FullName -Destination $TargetFile -Force
Write-Host "Arquivo anterior restaurado." -ForegroundColor Green

if ($Restart) {
    $StopScript = Join-Path $RepoRoot "scripts\ops\stop-dev.ps1"
    $StartScript = Join-Path $RepoRoot "scripts\ops\start-dev.ps1"

    & $StopScript -Port $PublicPort

    & $StartScript `
        -Port $PublicPort `
        -AppHost "127.0.0.1" `
        -Production `
        -BuildFrontend:$false `
        -SeedDemoData:$false

    Write-Host "Rollback aplicado e Frota reiniciado." -ForegroundColor Green
}
else {
    Write-Host "Rollback aplicado. Reinicie a aplicacao para carregar o arquivo restaurado." -ForegroundColor Yellow
}
