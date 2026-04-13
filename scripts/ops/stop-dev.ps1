[CmdletBinding()]
param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

Initialize-FrotaStorage
$paths = Get-FrotaPaths

$stopped = $false

$pidFromFile = Get-ProcessIdFromFile -Path $paths.AppPidFile
if ($pidFromFile -and (Test-ProcessAlive -Pid $pidFromFile)) {
    Write-Host "Encerrando Frota pelo PID registrado: $pidFromFile" -ForegroundColor Yellow
    Stop-ProcessTreeSafe -Pid $pidFromFile
    Start-Sleep -Seconds 2
    $stopped = $true
}

$ownerPid = Get-PortOwnerPid -Port $Port
if ($ownerPid -and (Test-ProcessAlive -Pid $ownerPid)) {
    Write-Host "Encerrando processo remanescente na porta $Port: PID $ownerPid" -ForegroundColor Yellow
    Stop-ProcessTreeSafe -Pid $ownerPid
    Start-Sleep -Seconds 2
    $stopped = $true
}

Remove-IfExists -Path $paths.AppPidFile
Remove-IfExists -Path $paths.SessionFile

if ($stopped) {
    Write-Host "Ambiente Frota parado." -ForegroundColor Green
}
else {
    Write-Host "Nenhum processo ativo do Frota foi encontrado." -ForegroundColor Yellow
}