[CmdletBinding()]
param([string]$EnvPath = "")

$ErrorActionPreference = "Stop"
$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($EnvPath)) {
    $EnvPath = Join-Path $repoRoot "backend\.env"
}
$EnvPath = [System.IO.Path]::GetFullPath($EnvPath)

if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw "Arquivo de ambiente nao encontrado: $EnvPath"
}

function Get-EnvValue {
    param([string]$Name)
    $line = Get-Content -LiteralPath $EnvPath |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -First 1
    if (-not $line) { return "" }
    return ($line -replace "^$([regex]::Escape($Name))=", "").Trim()
}

function Set-EnvValue {
    param([string]$Name, [string]$Value)
    $lines = @(Get-Content -LiteralPath $EnvPath)
    $found = $false
    $escaped = [regex]::Escape($Name)
    $updated = foreach ($line in $lines) {
        if ($line -match "^$escaped=") {
            $found = $true
            "$Name=$Value"
        }
        else { $line }
    }
    if (-not $found) { $updated += "$Name=$Value" }
    [IO.File]::WriteAllLines($EnvPath, $updated, (New-Object Text.UTF8Encoding($false)))
}

function New-SecureToken {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$knownDefaults = @("", "supersecretkeychangeinproduction", "troque_este_secret_em_producao")
$jwtSecret = Get-EnvValue -Name "SECRET_KEY"
$rotatedJwt = $knownDefaults -contains $jwtSecret -or $jwtSecret.Length -lt 32
if ($rotatedJwt) { Set-EnvValue -Name "SECRET_KEY" -Value (New-SecureToken) }

$evidenceSecret = Get-EnvValue -Name "SIGNATURE_EVIDENCE_SECRET"
$rotatedEvidence = $evidenceSecret.Length -lt 32
if ($rotatedEvidence) { Set-EnvValue -Name "SIGNATURE_EVIDENCE_SECRET" -Value (New-SecureToken) }

Set-EnvValue -Name "APP_ENV" -Value "production"
Set-EnvValue -Name "COOKIE_SECURE" -Value "true"
Set-EnvValue -Name "CORS_ORIGINS" -Value '["https://frota.sirel.com.br"]'
Set-EnvValue -Name "CSRF_TRUSTED_ORIGINS" -Value '["https://frota.sirel.com.br"]'
Set-EnvValue -Name "TRUSTED_HOSTS" -Value '["frota.sirel.com.br","localhost","127.0.0.1"]'
Set-EnvValue -Name "TRUSTED_PROXY_NETWORKS" -Value '["127.0.0.1/32","::1/128"]'
Set-EnvValue -Name "MAX_REQUEST_BODY_BYTES" -Value "67108864"

Write-Host "Ambiente de producao endurecido. JWT rotacionado=$rotatedJwt; chave de evidencia criada=$rotatedEvidence; segredos nao exibidos."
