[CmdletBinding()]
param([int]$Port = 3000)

$ErrorActionPreference = "Stop"
$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$frontendRoot = Join-Path $repoRoot "frontend"
$distIndex = Join-Path $frontendRoot "dist\index.html"

if (-not (Test-Path -LiteralPath $distIndex)) {
    throw "Build de producao nao encontrado. Execute npm run build antes da publicacao."
}

Set-Location $frontendRoot
npm run preview -- --host 127.0.0.1 --port $Port --strictPort
