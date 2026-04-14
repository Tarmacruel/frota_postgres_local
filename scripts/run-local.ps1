[CmdletBinding()]
param(
    [int]$Port = 8000,
    [string]$Host = "0.0.0.0",
    [switch]$Reload,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Convert-Path (Split-Path -Parent $PSScriptRoot)
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"
$nodeExe = Get-Command node -ErrorAction SilentlyContinue

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  FROTA - Iniciando Ambiente Local" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Porta: $Port | Host: $Host | Reload: $Reload" -ForegroundColor Yellow
Write-Host ""

# Verificar Python
if (-not (Test-Path $pythonExe)) {
    Write-Host "❌ ERRO: Python venv não encontrado em $pythonExe" -ForegroundColor Red
    exit 1
}

# Verificar .env do backend
$backendEnv = Join-Path $backendDir ".env"
if (-not (Test-Path $backendEnv)) {
    Write-Host "⚠️  WARNING: Criando .env padrão..." -ForegroundColor Yellow
    $backendEnvExample = Join-Path $backendDir ".env.example"
    if (Test-Path $backendEnvExample) {
        Copy-Item $backendEnvExample $backendEnv
    }
}

# Build frontend se necessário
$frontendDistPath = Join-Path $frontendDir "dist\index.html"
if (-not $SkipBuild -and -not (Test-Path $frontendDistPath)) {
    Write-Host "📦 Buildando frontend (falta dist/index.html)..." -ForegroundColor Cyan
    Push-Location $frontendDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build falhou"
        }
    }
    finally {
        Pop-Location
    }
}

# Iniciar Backend
Write-Host "▶️  Iniciando FastAPI Backend em http://$Host`:$Port" -ForegroundColor Green
Write-Host ""

$backendArgs = @(
    "-m", "uvicorn",
    "app.main:app",
    "--host", $Host,
    "--port", $Port
)

if ($Reload) {
    Write-Host "🔄 Modo reload ativado (watch mode)" -ForegroundColor Yellow
    $backendArgs += "--reload"
}

Set-Location $backendDir

Write-Host "📋 Preview de rotas disponíveis:" -ForegroundColor Cyan
Write-Host "   - API: http://$Host`:$Port/api" -ForegroundColor White
Write-Host "   - Swagger UI: http://$Host`:$Port/docs" -ForegroundColor White
Write-Host "   - ReDoc: http://$Host`:$Port/redoc" -ForegroundColor White
Write-Host "   - Frontend: http://$Host`:$Port/" -ForegroundColor White
Write-Host ""

& $pythonExe @backendArgs
