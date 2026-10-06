[CmdletBinding()]
param([switch]$AsJson)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Assert-HmlRepository
$result = [ordered]@{
    environment = "homologation"
    repositoryRoot = $repoRoot
    branch = (& git -C $repoRoot branch --show-current).Trim()
    secureVolume = [ordered]@{ mounted = $false; protected = $false; freeBytes = $null; aclRestricted = $false }
    services = [ordered]@{}
    productionPorts = [ordered]@{}
    healthy = $true
}

try {
    $mount = Assert-HmlSecureVolume -AllowLowFreeSpace
    $volume = Get-HmlVolumeForPath -Path $mount
    $result.secureVolume.mounted = $true
    $result.secureVolume.protected = $true
    $result.secureVolume.freeBytes = $volume.SizeRemaining
    $result.secureVolume.aclRestricted = Test-HmlSecureAcl -Path $mount
    if ($volume.SizeRemaining -lt $script:HmlMinimumFreeBytes) { $result.healthy = $false }
    $runtimeRoot = Join-Path $mount "runtime"
}
catch {
    $result.secureVolume["error"] = $_.Exception.Message
    $result.healthy = $false
    $runtimeRoot = $null
}

foreach ($service in @(
    @{ Name = "frontend"; Port = 3010; Health = "http://127.0.0.1:3010" },
    @{ Name = "backend"; Port = 8010; Health = "http://127.0.0.1:8010/api/health/ready" },
    @{ Name = "signer-agent"; Port = 54174; Health = $null }
)) {
    $listening = Test-HmlPortListening -Port $service.Port
    $owned = if ($runtimeRoot) { $null -ne (Get-HmlOwnedProcess -Name $service.Name -RuntimeRoot $runtimeRoot) } else { $false }
    $health = $null
    if ($listening -and $service.Health) {
        try { $health = (Invoke-WebRequest -UseBasicParsing -Uri $service.Health -TimeoutSec 3).StatusCode -eq 200 } catch { $health = $false }
    }
    $result.services[$service.Name] = [ordered]@{ port = $service.Port; listening = $listening; owned = $owned; health = $health }
    if ($listening -and -not $owned) { $result.healthy = $false }
    if ($owned -and -not $listening) { $result.healthy = $false }
    if ($listening -and $service.Health -and $health -eq $false) { $result.healthy = $false }
}

$postgresListening = Test-HmlPortListening -Port 5440
$postgresOwned = if ($result.secureVolume.mounted -and $postgresListening) { Test-HmlPostgresOwned } else { $false }
$result.services["postgres"] = [ordered]@{ port = 5440; listening = $postgresListening; owned = $postgresOwned }
if ($postgresListening -and -not $postgresOwned) { $result.healthy = $false }

$knownHmlPids = @()
if ($runtimeRoot) {
    foreach ($name in @("frontend", "backend", "signer-agent")) {
        $owned = Get-HmlOwnedProcess -Name $name -RuntimeRoot $runtimeRoot
        if ($owned) { $knownHmlPids += [int]$owned.Process.ProcessId }
    }
}
foreach ($port in $script:HmlReservedPorts) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    $ownedByHomologation = $listener -and ($knownHmlPids -contains [int]$listener.OwningProcess)
    $result.productionPorts["$port"] = [ordered]@{ inUse = $null -ne $listener; owningProcess = if ($listener) { $listener.OwningProcess } else { $null }; ownedByHomologation = [bool]$ownedByHomologation }
    if ($ownedByHomologation) { $result.healthy = $false }
}

if ($AsJson) {
    $result | ConvertTo-Json -Depth 8
}
else {
    Write-Host "Homologation status" -ForegroundColor Cyan
    Write-Host "  Secure volume: mounted=$($result.secureVolume.mounted), protected=$($result.secureVolume.protected), freeBytes=$($result.secureVolume.freeBytes)"
    foreach ($entry in $result.services.GetEnumerator()) {
        Write-Host "  $($entry.Key): port=$($entry.Value.port), listening=$($entry.Value.listening), owned=$($entry.Value.owned), health=$($entry.Value.health)"
    }
    Write-Host "  Overall healthy: $($result.healthy)"
}
if (-not $result.healthy) { exit 1 }
