param(
    [string]$Host = "127.0.0.1",
    [int]$Port = 5434,
    [string]$Database = "frota_db",
    [string]$DbUser = "frota_user",
    [string]$DbPassword = "frota_secret"
)

$ErrorActionPreference = "Stop"

$repoRoot = Convert-Path (Split-Path -Parent $PSScriptRoot)
$startPostgresScript = Join-Path $repoRoot "scripts\start_local_postgres.ps1"
$psqlExe = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
$alembicExe = Join-Path $repoRoot "backend\.venv\Scripts\alembic.exe"

if (-not (Test-Path $psqlExe)) {
    throw "psql.exe nao encontrado em '$psqlExe'."
}
if (-not (Test-Path $alembicExe)) {
    throw "Alembic nao encontrado em '$alembicExe'. Inicie o projeto ao menos uma vez para criar a .venv."
}

Write-Output "Garantindo PostgreSQL local..."
& $startPostgresScript -Port $Port -Database $Database -DbUser $DbUser -DbPassword $DbPassword
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao inicializar o PostgreSQL local."
}

$env:PGPASSWORD = $DbPassword
try {
    Write-Output "Resetando schema public de '$Database'..."
    & $psqlExe -h $Host -p $Port -U $DbUser -d $Database -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION $DbUser;"
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao resetar o schema public."
    }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Push-Location (Join-Path $repoRoot "backend")
try {
    Write-Output "Aplicando migracoes novamente..."
    & $alembicExe upgrade heads
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao aplicar migracoes apos reset."
    }
}
finally {
    Pop-Location
}

Write-Output "Reset concluido com sucesso."
