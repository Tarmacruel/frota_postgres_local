param(
    [int]$Port = 80,
    [string]$BindHost = "0.0.0.0"
)

$ErrorActionPreference = "Stop"

$repoRoot = Convert-Path (Split-Path -Parent $PSScriptRoot)
$startScript = Convert-Path (Join-Path $repoRoot "scripts\start_frota.ps1")

Set-Location $repoRoot
Write-Output "Iniciando Frota PMTF em modo producao na porta $Port."

& $startScript -Production -Port $Port -AppHost $BindHost
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao iniciar o Frota PMTF em modo producao."
}
