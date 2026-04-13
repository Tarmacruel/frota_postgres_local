[CmdletBinding()]
param(
    [ValidateSet("Menu", "StartLocal", "Stop", "Reset", "Status", "Logs", "Backup")]
    [string]$Action = "Menu"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

function Invoke-LauncherAction {
    param([string]$SelectedAction)

    switch ($SelectedAction) {
        "StartLocal" { & (Join-Path $PSScriptRoot "start-dev.ps1") }
        "Stop"       { & (Join-Path $PSScriptRoot "stop-dev.ps1") }
        "Reset"      { & (Join-Path $PSScriptRoot "reset-dev.ps1") }
        "Status"     { & (Join-Path $PSScriptRoot "status-dev.ps1") }
        "Logs"       { & (Join-Path $PSScriptRoot "logs-local.ps1") }
        "Backup"     { & (Join-Path (Get-FrotaPaths).BackupScript) }
        default      { throw "Ação não suportada: $SelectedAction" }
    }
}

if ($Action -ne "Menu") {
    Invoke-LauncherAction -SelectedAction $Action
    exit 0
}

Clear-Host
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " FROTA - Launcher Operacional Local" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "[1] Iniciar ambiente"
Write-Host "[2] Parar ambiente"
Write-Host "[3] Reset operacional"
Write-Host "[4] Status do ambiente"
Write-Host "[5] Abrir logs"
Write-Host "[6] Executar backup"
Write-Host "[0] Sair"
Write-Host ""

$option = Read-Host "Escolha uma opção"

switch ($option) {
    "1" { Invoke-LauncherAction -SelectedAction "StartLocal" }
    "2" { Invoke-LauncherAction -SelectedAction "Stop" }
    "3" { Invoke-LauncherAction -SelectedAction "Reset" }
    "4" { Invoke-LauncherAction -SelectedAction "Status" }
    "5" { Invoke-LauncherAction -SelectedAction "Logs" }
    "6" { Invoke-LauncherAction -SelectedAction "Backup" }
    "0" { Write-Host "Encerrando launcher." -ForegroundColor Yellow }
    default { Write-Host "Opção inválida." -ForegroundColor Red }
}

if ($option -ne "0") {
    Write-Host ""
    Read-Host "Pressione Enter para fechar"
}