[CmdletBinding()]
param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

$paths = Get-FrotaPaths

& (Join-Path $PSScriptRoot "stop-dev.ps1") -Port $Port

Remove-IfExists -Path $paths.AppLogFile
Remove-IfExists -Path $paths.AppErrLogFile

Write-Host "Reset operacional concluído." -ForegroundColor Green
Write-Host "Banco local, cluster PostgreSQL e dados não foram apagados."