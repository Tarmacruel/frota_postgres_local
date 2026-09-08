[CmdletBinding()]
param([switch]$KeepPostgres)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

[void](Assert-HmlRepository)
$mount = Assert-HmlSecureVolume -AllowLowFreeSpace
$runtimeRoot = Join-Path $mount "runtime"

$stopped = @()
foreach ($name in @("signer-agent", "frontend", "backend")) {
    if (Stop-HmlOwnedProcess -Name $name -RuntimeRoot $runtimeRoot) { $stopped += $name }
}
if (-not $KeepPostgres) { Stop-HmlPostgres }

Write-HmlAuditLog -Event "environment_stopped" -Data @{ processes = $stopped; postgresKept = [bool]$KeepPostgres }
Write-Host "Homologation processes stopped safely." -ForegroundColor Green
