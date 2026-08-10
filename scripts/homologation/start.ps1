[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$expectedRoot = "C:\FROTAS\frota_homolog"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if ($repoRoot.TrimEnd("\") -ine $expectedRoot) {
    throw "Este launcher só pode executar em $expectedRoot."
}

$backendPort = 8010
$frontendPort = 3010
$postgresPort = 5440
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$envPath = Join-Path $backendRoot ".env"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"
$runtimeRoot = Join-Path $repoRoot "storage\runtime"
$logsRoot = Join-Path $repoRoot "storage\logs"
$expectedStorage = Join-Path $repoRoot "data\uploads"

if (-not (Test-Path -LiteralPath $envPath)) { throw "Configuração de homologação ausente: $envPath" }
if (-not (Test-Path -LiteralPath $python)) { throw "Virtualenv de homologação ausente: $python" }
if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot "node_modules"))) { throw "Dependências do frontend de homologação ausentes." }

$envContents = Get-Content -LiteralPath $envPath -Raw
foreach ($required in @(
    "APP_ENV=testing",
    "127.0.0.1:5440/frota_homolog",
    "COOKIE_NAME=frota_homolog_access_token"
)) {
    if (-not $envContents.Contains($required)) {
        throw "A configuração não corresponde à homologação isolada."
    }
}

# Pydantic gives inherited environment variables precedence over backend/.env.
# Remove every setting that could redirect this launcher before validating and
# starting the child processes, so this process can only use the isolated file.
$settingEnvironmentNames = @(
    "DATABASE_URL",
    "SECRET_KEY",
    "SIGNATURE_EVIDENCE_SECRET",
    "ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "STORAGE_DIR",
    "CORS_ORIGINS",
    "COOKIE_NAME",
    "CSRF_COOKIE_NAME",
    "CSRF_TRUSTED_ORIGINS",
    "COOKIE_SECURE",
    "TRUSTED_PROXY_NETWORKS",
    "MAX_USER_AGENT_LENGTH",
    "MAX_REQUEST_BODY_BYTES",
    "TRUSTED_HOSTS",
    "APP_ENV",
    "ENABLE_LEGACY_FUEL_SUPPLY_CREATE"
)
foreach ($settingEnvironmentName in $settingEnvironmentNames) {
    Remove-Item -LiteralPath "Env:$settingEnvironmentName" -ErrorAction SilentlyContinue
}

$settingsValidation = @'
from pathlib import Path
from urllib.parse import urlparse

from app.core.config import settings

root = Path(r'C:\FROTAS\frota_homolog').resolve()
storage = Path(settings.STORAGE_DIR).resolve()
url = urlparse(settings.DATABASE_URL)

if settings.APP_ENV != 'testing':
    raise SystemExit('APP_ENV efetivo deve ser testing')
if url.hostname != '127.0.0.1' or url.port != 5440 or url.path != '/frota_homolog':
    raise SystemExit('DATABASE_URL efetiva deve apontar para 127.0.0.1:5440/frota_homolog')
if storage != root / 'data' / 'uploads':
    raise SystemExit('STORAGE_DIR efetivo deve permanecer dentro da homologação')
if set(settings.CORS_ORIGINS) != {'http://127.0.0.1:3010'}:
    raise SystemExit('CORS deve aceitar somente http://127.0.0.1:3010')
if set(settings.CSRF_TRUSTED_ORIGINS) != {'http://127.0.0.1:3010'}:
    raise SystemExit('CSRF deve aceitar somente http://127.0.0.1:3010')
if not settings.COOKIE_NAME.startswith('frota_homolog_'):
    raise SystemExit('COOKIE_NAME deve ser exclusivo da homologação')
if not settings.CSRF_COOKIE_NAME.startswith('frota_homolog_'):
    raise SystemExit('CSRF_COOKIE_NAME deve ser exclusivo da homologação')
if settings.COOKIE_NAME == settings.CSRF_COOKIE_NAME or settings.COOKIE_SECURE:
    raise SystemExit('Cookies de homologação devem ser distintos e funcionar em HTTP loopback')
'@
Push-Location $backendRoot
try {
    & $python -c $settingsValidation
    if ($LASTEXITCODE -ne 0) { throw "A configuração efetiva não corresponde à homologação isolada." }
} finally {
    Pop-Location
}

foreach ($port in @($backendPort, $frontendPort)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) { throw "A porta $port já está em uso (PID $($listener.OwningProcess))." }
}

$postgres = Get-NetTCPConnection -LocalPort $postgresPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $postgres) { throw "O PostgreSQL isolado não está ativo na porta $postgresPort." }

New-Item -ItemType Directory -Force -Path $runtimeRoot, $logsRoot | Out-Null

$backendCommand = @'
Set-Location '__BACKEND_ROOT__'
& '__PYTHON__' -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
'@
$backendCommand = $backendCommand.Replace("__BACKEND_ROOT__", $backendRoot).Replace("__PYTHON__", $python)

$frontendCommand = @'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8010'
$env:VITE_API_BASE_URL = '/api'
Set-Location '__FRONTEND_ROOT__'
npm run dev -- --host 127.0.0.1 --port 3010 --strictPort
'@
$frontendCommand = $frontendCommand.Replace("__FRONTEND_ROOT__", $frontendRoot)

$backend = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand) -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $logsRoot "homologation-backend.out.log") -RedirectStandardError (Join-Path $logsRoot "homologation-backend.err.log") -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand) -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $logsRoot "homologation-frontend.out.log") -RedirectStandardError (Join-Path $logsRoot "homologation-frontend.err.log") -WindowStyle Hidden -PassThru

Set-Content -LiteralPath (Join-Path $runtimeRoot "homologation-backend.pid") -Value $backend.Id -Encoding ASCII
Set-Content -LiteralPath (Join-Path $runtimeRoot "homologation-frontend.pid") -Value $frontend.Id -Encoding ASCII

Write-Host "Homologação iniciada em http://127.0.0.1:$frontendPort" -ForegroundColor Green
Write-Host "Backend: http://127.0.0.1:$backendPort/api/health" -ForegroundColor Cyan
