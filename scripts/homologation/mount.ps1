[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

[void](Assert-HmlRepository)
$mount = Connect-HmlSecureVolume
Write-HmlAuditLog -Event "secure_volume_mounted" -Data @{ mount = $mount }
Write-Host "Encrypted homologation volume mounted at '$mount'." -ForegroundColor Green
