[CmdletBinding()]
param(
    [int]$Port = 8000,
    [string]$AppHost = "0.0.0.0",
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
if ($currentPid -and (Test-ProcessAlive -ProcessId $currentPid)) {
    Write-Host "Frota already running on PID $currentPid." -ForegroundColor Yellow
    exit 0
}

$portOwner = Get-PortOwnerPid -Port $Port
if ($portOwner) {
    throw "Port $Port is already in use by PID $portOwner."
}

Remove-IfExists -Path $paths.AppPidFile
Remove-IfExists -Path $paths.SessionFile

Write-Host "Starting Frota local environment..." -ForegroundColor Cyan

$argumentList = @(
    "-NoProfile"
    "-ExecutionPolicy", "Bypass"
    "-File", "`"$($paths.StartScript)`""
    "-AppHost", "$AppHost"
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

$timeoutSeconds = if ($BuildFrontend) { 180 } else { 45 }
$deadline = (Get-Date).AddSeconds($timeoutSeconds)
$portReady = $false

while ((Get-Date) -lt $deadline) {
    if (-not (Test-ProcessAlive -ProcessId $process.Id)) {
        break
    }

    $portOwner = Get-PortOwnerPid -Port $Port
    if ($portOwner) {
        $portReady = $true
        break
    }

    Start-Sleep -Seconds 2
}

if (-not (Test-ProcessAlive -ProcessId $process.Id)) {
    throw "Frota process terminated soon after starting. Check logs in storage\logs."
}

if (-not $portReady) {
    throw "Process started (PID $($process.Id)), but port $Port not available in ${timeoutSeconds}s. Check logs in storage\logs."
}

Write-FrotaSession `
    -ProcessId $process.Id `
    -Port $Port `
    -BuildFrontend ([bool]$BuildFrontend) `
    -SeedDemoData ([bool]$SeedDemoData) `
    -Production ([bool]$Production)

Write-Host "Frota started successfully." -ForegroundColor Green
Write-Host "PID: $($process.Id)"
Write-Host "URL: http://localhost:$Port"
Write-Host "Log: $($paths.AppLogFile)"
Write-Host "Error: $($paths.AppErrLogFile)"
