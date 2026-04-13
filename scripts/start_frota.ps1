param(
    [int]$Port = 8000,
    [string]$AppHost = "0.0.0.0",
    [switch]$BuildFrontend,
    [switch]$Reload,
    [switch]$SkipMigrate,
    [switch]$SkipLocalPostgres,
    [switch]$SeedDemoData,
    [switch]$InstallDeps,
    [switch]$Production
)

$ErrorActionPreference = "Stop"

$repoRoot = Convert-Path (Split-Path -Parent $PSScriptRoot)
$backendDir = Convert-Path (Join-Path $repoRoot "backend")
$frontendDir = Convert-Path (Join-Path $repoRoot "frontend")
$postgresBootstrapScript = Convert-Path (Join-Path $repoRoot "scripts\start_local_postgres.ps1")
$venvDir = Join-Path $backendDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\\python.exe"
$alembicExe = Join-Path $venvDir "Scripts\\alembic.exe"
$uvicornExe = Join-Path $venvDir "Scripts\\uvicorn.exe"
$backendEnv = Join-Path $backendDir ".env"
$backendEnvExample = Join-Path $backendDir ".env.example"
$pyLauncher = Get-Command py -ErrorAction SilentlyContinue
$systemPython = Get-Command python -ErrorAction SilentlyContinue

Set-Location $repoRoot

function Invoke-ExternalStep {
    param(
        [string]$Label,
        [scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label falhou com codigo $LASTEXITCODE."
    }
}

if (-not (Test-Path $backendEnv) -and (Test-Path $backendEnvExample)) {
    Copy-Item $backendEnvExample $backendEnv
}

if ($Production) {
    $env:APP_ENV = "production"
    $env:COOKIE_SECURE = "true"
    $env:CORS_ORIGINS = "[`"https://frota.sirel.com.br`",`"http://frota.sirel.com.br`"]"
}

if (-not (Test-Path $pythonExe)) {
    if ($pyLauncher) {
        try {
            Invoke-ExternalStep "Criacao do ambiente virtual" { py -3.12 -m venv $venvDir }
        }
        catch {
            Invoke-ExternalStep "Criacao do ambiente virtual" { py -3 -m venv $venvDir }
        }
    }
    elseif ($systemPython) {
        Invoke-ExternalStep "Criacao do ambiente virtual" { python -m venv $venvDir }
    }
    else {
        throw "Python nao encontrado. Instale Python 3.11+ para continuar."
    }

    Invoke-ExternalStep "Reparo inicial do pip" { & $pythonExe -m ensurepip --upgrade }
    Invoke-ExternalStep "Atualizacao do pip" { & $pythonExe -m pip install --upgrade pip }
    Invoke-ExternalStep "Instalacao das dependencias Python" { & $pythonExe -m pip install -r (Join-Path $backendDir "requirements.txt") }
}
elseif ($InstallDeps) {
    $pythonExe = Convert-Path $pythonExe
    Invoke-ExternalStep "Reparo do pip" { & $pythonExe -m ensurepip --upgrade }
    Invoke-ExternalStep "Instalacao das dependencias Python" { & $pythonExe -m pip install -r (Join-Path $backendDir "requirements.txt") }
}

if (Test-Path $pythonExe) {
    $pythonExe = Convert-Path $pythonExe
    $alembicExe = Convert-Path $alembicExe
    $uvicornExe = Convert-Path $uvicornExe
}

if ($BuildFrontend) {
    Push-Location $frontendDir
    try {
        Write-Output "Preparando build do frontend..."
        if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
            Invoke-ExternalStep "Instalacao das dependencias do frontend" { npm install }
        }
        Invoke-ExternalStep "Build do frontend" { npm run build }
    }
    finally {
        Pop-Location
    }
}

if (-not $SkipLocalPostgres) {
    Write-Output "Garantindo PostgreSQL local..."
    Invoke-ExternalStep "Inicializacao do PostgreSQL local" { & $postgresBootstrapScript }
}

Push-Location $backendDir
try {
    if (-not $SkipMigrate) {
        Write-Output "Aplicando migracoes do banco..."
        try {
            Invoke-ExternalStep "Migracoes do banco" { & $alembicExe upgrade head }
        }
        catch {
            if ($_.Exception.Message -like "*Multiple head revisions are present*") {
                Write-Warning "Multiplos heads detectados no Alembic. Aplicando todas as heads automaticamente..."
                Invoke-ExternalStep "Migracoes do banco (heads)" { & $alembicExe upgrade heads }
            }
            else {
                throw
            }
        }
    }

    if ($SeedDemoData) {
        Write-Output "Executando seed inicial..."
        Invoke-ExternalStep "Seed inicial" { & $pythonExe -m scripts.seed }
    }

    $env:PYTHONPATH = $backendDir
    $uvicornArgs = @("app.main:app", "--host", $AppHost, "--port", "$Port")
    if ($Reload) {
        $uvicornArgs += "--reload"
    }

    Write-Output "Iniciando servidor HTTP em ${AppHost}:$Port..."
    & $uvicornExe @uvicornArgs
}
finally {
    Pop-Location
}
