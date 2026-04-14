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
$frontendIndex = Join-Path $frontendDir "dist\\index.html"
$postgresBootstrapScript = Convert-Path (Join-Path $repoRoot "scripts\start_local_postgres.ps1")
$venvDir = Join-Path $backendDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\\python.exe"
$alembicExe = Join-Path $venvDir "Scripts\\alembic.exe"
$uvicornExe = Join-Path $venvDir "Scripts\\uvicorn.exe"
$backendEnv = Join-Path $backendDir ".env"
$backendEnvExample = Join-Path $backendDir ".env.example"
$backendProductionEnv = Join-Path $backendDir ".env.production"
$backendProductionEnvExample = Join-Path $backendDir ".env.production.example"
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

function Import-EnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            return
        }

        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()
        [Environment]::SetEnvironmentVariable($key, $value)
    }
}

if (-not (Test-Path $backendEnv) -and (Test-Path $backendEnvExample)) {
    Copy-Item $backendEnvExample $backendEnv
}

Import-EnvFile -Path $backendEnv

if ($Production -and -not (Test-Path $backendProductionEnv) -and (Test-Path $backendProductionEnvExample)) {
    Copy-Item $backendProductionEnvExample $backendProductionEnv
}

if ($Production) {
    Import-EnvFile -Path $backendProductionEnv
}

if ($Production) {
    $isLoopbackHost = $AppHost -eq "127.0.0.1" -or $AppHost -eq "localhost"
    $env:APP_ENV = "production"
    $env:COOKIE_SECURE = if ($isLoopbackHost) { "false" } else { "true" }
    $env:CORS_ORIGINS = if ($isLoopbackHost) {
        "[`"http://127.0.0.1`",`"http://127.0.0.1:80`",`"http://localhost`",`"http://localhost:80`",`"https://frota.sirel.com.br`",`"http://frota.sirel.com.br`"]"
    }
    else {
        "[`"https://frota.sirel.com.br`",`"http://frota.sirel.com.br`"]"
    }
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

if ($BuildFrontend -and -not $Production) {
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
        Invoke-ExternalStep "Migracoes do banco" { & $alembicExe upgrade heads }
    }

    if ($SeedDemoData) {
        Write-Output "Executando seed inicial..."
        Invoke-ExternalStep "Seed inicial" { & $pythonExe -m scripts.seed }
    }

    $env:PYTHONPATH = $backendDir

    if ($Production) {
        $apiHost = "127.0.0.1"
        $apiPort = 8000
        $frontendHost = $AppHost
        $frontendPort = $Port
        $frontendProcess = $null

        Write-Output "Iniciando backend (API) em ${apiHost}:$apiPort..."
        $backendArgs = @("app.main:app", "--host", $apiHost, "--port", "$apiPort")
        $frontendProcess = Start-Process `
            -FilePath $uvicornExe `
            -ArgumentList $backendArgs `
            -WorkingDirectory $backendDir `
            -PassThru

        try {
            Push-Location $frontendDir
            try {
                if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
                    Invoke-ExternalStep "Instalacao das dependencias do frontend" { npm install }
                }

                $env:VITE_API_PROXY_TARGET = "http://127.0.0.1:$apiPort"
                Write-Output "Iniciando frontend em ${frontendHost}:$frontendPort com proxy para API em 127.0.0.1:$apiPort..."
                & npm run dev -- --host $frontendHost --port $frontendPort --strictPort
            }
            finally {
                Pop-Location
            }
        }
        finally {
            if ($frontendProcess -and -not $frontendProcess.HasExited) {
                Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
            }
        }

        return
    }

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
