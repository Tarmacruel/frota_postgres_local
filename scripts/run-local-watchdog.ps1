[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$runtimeRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$watchdog = Join-Path $PSScriptRoot "frota-watchdog.ps1"

& $watchdog `
    -SkipSync `
    -SourceRoot "" `
    -RuntimeRoot $runtimeRoot `
    -DataRoot (Join-Path $runtimeRoot "data\uploads") `
    -BackendPort 8000 `
    -FrontendPort 3000 `
    -PostgresServiceName "postgresql-x64-16" `
    -CloudflaredServiceName "Cloudflared" `
    -PublicHealthUrl "https://frota.sirel.com.br/api/health/ready"

exit $LASTEXITCODE
