[CmdletBinding()]
param(
    [int]$Port = 8000,
    [switch]$Production,
    [switch]$SeedDemoData = $true,
    [switch]$BuildFrontend = $true
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

Initialize-FrotaStorage
$paths = Get-FrotaPaths

$currentPid = Get-ProcessIdFromFile -Path $paths.AppPidFile
if ($currentPid -and (Test-ProcessAlive -Pid $currentPid)) {
    Write-Host "O Frota já está em execução no PID $currentPid." -ForegroundColor Yellow
    exit 0
}

$portOwner = Get-PortOwnerPid -Port $Port
if ($portOwner) {
    throw "A porta $Port já está em uso pelo PID $portOwner."
}

Remove-IfExists -Path $paths.AppPidFile
Remove-IfExists -Path $paths.SessionFile

Write-Host "Iniciando ambiente local do Frota..." -ForegroundColor Cyan

$argumentList = @(
    "-NoProfile"
    "-ExecutionPolicy", "Bypass"
    "-File", "`"$($paths.StartScript)`""
    "-Port", "$Port"
)

if ($BuildFrontend) {
    $argumentList += "-BuildFrontend"
}

if ($SeedDemoData) {
    $argumentList += "-SeedDemoData"
}

if ($Production) {
    $argumentList += "-Production"
}

$process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $argumentList `
    -WorkingDirectory $paths.Root `
    -RedirectStandardOutput $paths.AppLogFile `
    -RedirectStandardError $paths.AppErrLogFile `
    -PassThru

Start-Sleep -Seconds 4

if (-not (Test-ProcessAlive -Pid $process.Id)) {
    throw "O processo do Frota encerrou logo após iniciar. Verifique os logs em storage\logs."
}

Write-FrotaSession `
    -Pid $process.Id `
    -Port $Port `
    -BuildFrontend ([bool]$BuildFrontend) `
    -SeedDemoData ([bool]$SeedDemoData) `
    -Production ([bool]$Production)

Write-Host "Frota iniciado com sucesso." -ForegroundColor Green
Write-Host "PID: $($process.Id)"
Write-Host "URL: http://localhost:$Port"
Write-Host "Log: $($paths.AppLogFile)"
Write-Host "Erro: $($paths.AppErrLogFile)"