param(
    [string]$DataDir = "$env:LOCALAPPDATA\FrotaPMTF\postgres-data",
    [int]$Port = 5434,
    [string]$Database = "frota_db",
    [string]$DbUser = "frota_user",
    [string]$DbPassword = "frota_secret"
)

$ErrorActionPreference = "Stop"

$pgBin = "C:\Program Files\PostgreSQL\18\bin"
$initdbExe = Join-Path $pgBin "initdb.exe"
$pgCtlExe = Join-Path $pgBin "pg_ctl.exe"
$psqlExe = Join-Path $pgBin "psql.exe"
$configPath = Join-Path $DataDir "postgresql.conf"
$logPath = Join-Path $DataDir "postgres.log"

if (-not (Test-Path $initdbExe) -or -not (Test-Path $pgCtlExe) -or -not (Test-Path $psqlExe)) {
    throw "Binarios do PostgreSQL 18 nao encontrados em '$pgBin'."
}

if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

if (-not (Test-Path (Join-Path $DataDir "PG_VERSION"))) {
    & $initdbExe -D $DataDir -U postgres --auth=trust --encoding=UTF8
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao inicializar o cluster PostgreSQL local."
    }
}

$config = Get-Content $configPath -Raw
$config = $config -replace "#?listen_addresses\s*=.*", "listen_addresses = '127.0.0.1'"
$config = $config -replace "#?port\s*=.*", "port = $Port"
Set-Content $configPath $config

& $pgCtlExe -D $DataDir status | Out-Null
if ($LASTEXITCODE -ne 0) {
    & $pgCtlExe -D $DataDir -l $logPath -o "-p $Port" start | Out-Null
    Start-Sleep -Seconds 3
}

& $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -c "SELECT 1;" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Cluster PostgreSQL local nao respondeu em 127.0.0.1:$Port."
}

$roleExists = & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DbUser'"
if ($roleExists -match "1") {
    & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -c "ALTER ROLE $DbUser WITH LOGIN PASSWORD '$DbPassword';" | Out-Null
}
else {
    & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -c "CREATE ROLE $DbUser LOGIN PASSWORD '$DbPassword';" | Out-Null
}

if ($LASTEXITCODE -ne 0) {
    throw "Falha ao preparar o usuario '$DbUser'."
}

$dbExists = & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
if ($dbExists -notmatch "1") {
    & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -c "CREATE DATABASE $Database OWNER $DbUser;" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar o banco '$Database'."
    }
}

& $psqlExe -h 127.0.0.1 -p $Port -U postgres -d postgres -c "ALTER DATABASE $Database OWNER TO $DbUser;" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao definir o proprietario do banco '$Database'."
}

$ownershipSql = @"
ALTER SCHEMA public OWNER TO $DbUser;
GRANT ALL ON SCHEMA public TO $DbUser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DbUser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DbUser;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DbUser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DbUser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DbUser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DbUser;
"@

& $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -c $ownershipSql | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao ajustar as permissoes do banco '$Database'."
}

$relationOwnerSql = @"
SELECT format(
    'ALTER %s %I.%I OWNER TO %I;',
    CASE c.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
    END,
    n.nspname,
    c.relname,
    '$DbUser'
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
  AND pg_get_userbyid(c.relowner) <> '$DbUser';
"@

$relationStatements = & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -tA -c $relationOwnerSql
foreach ($statement in $relationStatements) {
    if ([string]::IsNullOrWhiteSpace($statement)) {
        continue
    }

    & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -c $statement | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao ajustar o proprietario de um objeto relacional em '$Database'."
    }
}

$functionOwnerSql = @"
SELECT format(
    'ALTER FUNCTION %I.%I(%s) OWNER TO %I;',
    n.nspname,
    p.proname,
    pg_get_function_identity_arguments(p.oid),
    '$DbUser'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND pg_get_userbyid(p.proowner) <> '$DbUser';
"@

$functionStatements = & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -tA -c $functionOwnerSql
foreach ($statement in $functionStatements) {
    if ([string]::IsNullOrWhiteSpace($statement)) {
        continue
    }

    & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -c $statement | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao ajustar o proprietario de uma funcao em '$Database'."
    }
}

$typeOwnerSql = @"
SELECT format(
    'ALTER TYPE %I.%I OWNER TO %I;',
    n.nspname,
    t.typname,
    '$DbUser'
)
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typname IN ('user_role', 'vehicle_status')
  AND pg_get_userbyid(t.typowner) <> '$DbUser';
"@

$typeStatements = & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -tA -c $typeOwnerSql
foreach ($statement in $typeStatements) {
    if ([string]::IsNullOrWhiteSpace($statement)) {
        continue
    }

    & $psqlExe -h 127.0.0.1 -p $Port -U postgres -d $Database -c $statement | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao ajustar o proprietario de um tipo em '$Database'."
    }
}

Write-Output "PostgreSQL local pronto em 127.0.0.1:$Port/$Database"
