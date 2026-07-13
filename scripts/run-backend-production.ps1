[CmdletBinding()]
param([int]$Port = 8000)

$ErrorActionPreference = "Stop"
$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$backendRoot = Join-Path $repoRoot "backend"
$pythonExe = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw "Python do backend nao encontrado em '$pythonExe'."
}

Set-Location $backendRoot
& $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port $Port --no-access-log
