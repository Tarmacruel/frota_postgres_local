[CmdletBinding()]
param(
    [string]$RepoRoot = "Z:\FROTAS\frota_postgres_local",
    [int]$PublicPort = 80,
    [switch]$Restart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceFile = Join-Path $PatchRoot "backend\app\services\maintenance_service.py"
$TargetFile = Join-Path $RepoRoot "backend\app\services\maintenance_service.py"
$BackupDir = Join-Path $RepoRoot "storage\hotfix-backups"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupFile = Join-Path $BackupDir "maintenance_service.py.$Timestamp.bak"
$Python = Join-Path $RepoRoot "backend\.venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repositorio nao encontrado: $RepoRoot"
}

if (-not (Test-Path -LiteralPath $SourceFile)) {
    throw "Arquivo corrigido nao encontrado no pacote: $SourceFile"
}

if (-not (Test-Path -LiteralPath $TargetFile)) {
    throw "Arquivo de destino nao encontrado: $TargetFile"
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

Write-Host "1/5 - Criando backup..." -ForegroundColor Cyan
Copy-Item -LiteralPath $TargetFile -Destination $BackupFile -Force
Write-Host "Backup: $BackupFile" -ForegroundColor Green

Write-Host "2/5 - Instalando maintenance_service.py corrigido..." -ForegroundColor Cyan
Copy-Item -LiteralPath $SourceFile -Destination $TargetFile -Force

Write-Host "3/5 - Validando sintaxe Python..." -ForegroundColor Cyan
if (Test-Path -LiteralPath $Python) {
    & $Python -m py_compile $TargetFile
    if ($LASTEXITCODE -ne 0) {
        Copy-Item -LiteralPath $BackupFile -Destination $TargetFile -Force
        throw "Falha na validacao Python. O arquivo anterior foi restaurado."
    }
}
else {
    Write-Warning "Python do venv nao encontrado em $Python. A validacao de sintaxe foi ignorada."
}

Write-Host "4/5 - Hotfix instalado." -ForegroundColor Green
Write-Host "Nao ha alteracao de banco de dados e nenhuma migration nova e necessaria." -ForegroundColor DarkGray

if ($Restart) {
    Write-Host "5/5 - Reiniciando o ambiente de producao..." -ForegroundColor Cyan

    $StopScript = Join-Path $RepoRoot "scripts\ops\stop-dev.ps1"
    $StartScript = Join-Path $RepoRoot "scripts\ops\start-dev.ps1"

    if (-not (Test-Path -LiteralPath $StopScript)) {
        throw "Script de parada nao encontrado: $StopScript"
    }

    if (-not (Test-Path -LiteralPath $StartScript)) {
        throw "Script de inicializacao nao encontrado: $StartScript"
    }

    & $StopScript -Port $PublicPort

    & $StartScript `
        -Port $PublicPort `
        -AppHost "127.0.0.1" `
        -Production `
        -BuildFrontend:$false `
        -SeedDemoData:$false

    Write-Host "Frota reiniciado." -ForegroundColor Green
}
else {
    Write-Host "5/5 - Reinicio nao executado." -ForegroundColor Yellow
    Write-Host "Rode novamente com -Restart quando estiver pronto para reiniciar a aplicacao." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "HOTFIX CONCLUIDO" -ForegroundColor Green
Write-Host "Arquivo aplicado: $TargetFile"
Write-Host "Backup anterior: $BackupFile"
