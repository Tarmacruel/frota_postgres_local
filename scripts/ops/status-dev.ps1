[CmdletBinding()]
param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

Initialize-FrotaStorage
$paths = Get-FrotaPaths
$session = Read-FrotaSession
$pidFromFile = Get-ProcessIdFromFile -Path $paths.AppPidFile
$pidAlive = $false

if ($pidFromFile) {
    $pidAlive = Test-ProcessAlive -ProcessId $pidFromFile
}

$portOwner = Get-PortOwnerPid -Port $Port

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " FROTA - Status Operacional Local" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

if ($session) {
    Write-Host "Sessão iniciada em : $($session.startedAt)"
    Write-Host "PID registrado     : $($session.pid)"
    Write-Host "Porta registrada   : $($session.port)"
    Write-Host "Build frontend     : $($session.buildFrontend)"
    Write-Host "Seed demo          : $($session.seedDemoData)"
    Write-Host "Modo produção      : $($session.production)"
}
else {
    Write-Host "Sessão registrada   : não encontrada"
}

Write-Host "PID em execução     : $pidAlive"
Write-Host "Dono da porta $Port  : $portOwner"
Write-Host "Log principal       : $($paths.AppLogFile)"
Write-Host "Log de erro         : $($paths.AppErrLogFile)"
Write-Host "PID file            : $($paths.AppPidFile)"