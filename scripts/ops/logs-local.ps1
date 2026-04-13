[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

Initialize-FrotaStorage
$paths = Get-FrotaPaths

Start-Process explorer.exe $paths.LogsRoot | Out-Null
Write-Host "Pasta de logs aberta: $($paths.LogsRoot)" -ForegroundColor Green