param(
    [string]$DataDir = "$env:LOCALAPPDATA\FrotaPMTF\postgres-data",
    [int]$Port = 5432,
    [string]$Database = "frota_db",
    [string]$DbUser = "frota_user",
    [string]$DbPassword = "frota_secret",
    [string]$SuperUser = "frota_user",
    [string]$SuperPassword = "",
    [string]$BackupRoot = "",
    [bool]$AutoRestoreLatest = $true
)

$ErrorActionPreference = "Stop"

function Test-PortInUse {
    param([int]$PortToCheck)
    $result = netstat -ano | Select-String ":$PortToCheck\\s"
    return ($null -ne $result)
}

$pgBinCandidates = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\17\bin",
    "C:\Program Files\PostgreSQL\18\bin"
)
$pgBin = $pgBinCandidates | Where-Object { Test-Path (Join-Path $_ "psql.exe") } | Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($pgBin)) {
    throw "Binarios do PostgreSQL nao encontrados. Verifique instalacao em 'C:\Program Files\PostgreSQL\<versao>\bin'."
}

$initdbExe = Join-Path $pgBin "initdb.exe"
$pgCtlExe = Join-Path $pgBin "pg_ctl.exe"
$psqlExe = Join-Path $pgBin "psql.exe"
$configPath = Join-Path $DataDir "postgresql.conf"
$logPath = Join-Path $DataDir "postgres.log"
if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
    $BackupRoot = Join-Path (Join-Path $PSScriptRoot "..") "storage\backups"
}

function Invoke-Psql {
    param(
        [string]$User,
        [string]$Db,
        [string]$Sql,
        [string]$Password = "",
        [switch]$Capture
    )

    $oldPassword = $env:PGPASSWORD
    if ([string]::IsNullOrEmpty($Password)) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    else {
        $env:PGPASSWORD = $Password
    }

    $args = @(
        "-w",
        "-h", "127.0.0.1",
        "-p", "$Port",
        "-U", $User,
        "-d", $Db,
        "-v", "ON_ERROR_STOP=1",
        "-tA",
        "-c", $Sql
    )

    try {
        if ($Capture) {
            return (& $psqlExe @args)
        }

        & $psqlExe @args | Out-Null
        return $LASTEXITCODE
    }
    finally {
        if ([string]::IsNullOrEmpty($oldPassword)) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
        else {
            $env:PGPASSWORD = $oldPassword
        }
    }
}

function Invoke-PsqlFile {
    param(
        [string]$User,
        [string]$Db,
        [string]$FilePath,
        [string]$Password = ""
    )

    $oldPassword = $env:PGPASSWORD
    if ([string]::IsNullOrEmpty($Password)) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    else {
        $env:PGPASSWORD = $Password
    }

    $args = @(
        "-w",
        "-h", "127.0.0.1",
        "-p", "$Port",
        "-U", $User,
        "-d", $Db,
        "-v", "ON_ERROR_STOP=1",
        "-f", $FilePath
    )

    try {
        & $psqlExe @args | Out-Null
        return $LASTEXITCODE
    }
    finally {
        if ([string]::IsNullOrEmpty($oldPassword)) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
        else {
            $env:PGPASSWORD = $oldPassword
        }
    }
}

$portInUse = Test-PortInUse -PortToCheck $Port
$hasManagedCluster = Test-Path (Join-Path $DataDir "PG_VERSION")

if (-not $portInUse) {
    if (-not $hasManagedCluster) {
        if (-not (Test-Path $DataDir)) {
            New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
        }

        if (-not (Test-Path $initdbExe) -or -not (Test-Path $pgCtlExe)) {
            throw "initdb/pg_ctl nao encontrados em '$pgBin'."
        }

        & $initdbExe -D $DataDir -U postgres --auth=trust --encoding=UTF8
        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao inicializar o cluster PostgreSQL local."
        }
    }

    if (Test-Path $configPath) {
        $config = Get-Content $configPath -Raw
        $config = $config -replace "#?listen_addresses\s*=.*", "listen_addresses = '127.0.0.1'"
        $config = $config -replace "#?port\s*=.*", "port = $Port"
        Set-Content $configPath $config
    }

    & $pgCtlExe -D $DataDir status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        & $pgCtlExe -D $DataDir -l $logPath -o "-p $Port" start | Out-Null
        Start-Sleep -Seconds 3
    }
}
else {
    Write-Output "Porta $Port ja esta em uso. Usando servidor PostgreSQL ja ativo."
}

$superUserCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($SuperUser)) { $superUserCandidates += $SuperUser }
if ($superUserCandidates -notcontains "postgres") { $superUserCandidates += "postgres" }
if ($superUserCandidates -notcontains "frota_user") { $superUserCandidates += "frota_user" }

$superPasswordCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($SuperPassword)) { $superPasswordCandidates += $SuperPassword }
if ($superPasswordCandidates -notcontains $DbPassword) { $superPasswordCandidates += $DbPassword }
if ($superPasswordCandidates -notcontains "postgres") { $superPasswordCandidates += "postgres" }
if ($superPasswordCandidates -notcontains "frota_secret") { $superPasswordCandidates += "frota_secret" }
$superPasswordCandidates += ""

$authenticatedSuperUser = $null
$authenticatedSuperPassword = $null
foreach ($userCandidate in $superUserCandidates) {
    foreach ($passwordCandidate in $superPasswordCandidates) {
        $superCheck = Invoke-Psql -User $userCandidate -Db "postgres" -Sql "SELECT 1" -Password $passwordCandidate
        if ($superCheck -eq 0) {
            $authenticatedSuperUser = $userCandidate
            $authenticatedSuperPassword = $passwordCandidate
            break
        }
    }

    if ($null -ne $authenticatedSuperUser) {
        break
    }
}

if ($null -eq $authenticatedSuperUser) {
    throw "Falha ao autenticar com usuario administrador. Informe -SuperUser/-SuperPassword corretos (ou defina PG_SUPER_PASSWORD)."
}

$safeDbPassword = $DbPassword.Replace("'", "''")
$safeDbUser = $DbUser.Replace("'", "''")
$safeDatabase = $Database.Replace("'", "''")

$roleExists = Invoke-Psql -User $authenticatedSuperUser -Db "postgres" -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$safeDbUser'" -Password $authenticatedSuperPassword -Capture
if ($roleExists -match "1") {
    $updateRole = Invoke-Psql -User $authenticatedSuperUser -Db "postgres" -Sql "ALTER ROLE \"$DbUser\" WITH LOGIN PASSWORD '$safeDbPassword';" -Password $authenticatedSuperPassword
    if ($updateRole -ne 0) {
        throw "Falha ao atualizar usuario '$DbUser'."
    }
}
else {
    $createRole = Invoke-Psql -User $authenticatedSuperUser -Db "postgres" -Sql "CREATE ROLE \"$DbUser\" LOGIN PASSWORD '$safeDbPassword';" -Password $authenticatedSuperPassword
    if ($createRole -ne 0) {
        throw "Falha ao criar usuario '$DbUser'."
    }
}

$dbExists = Invoke-Psql -User $authenticatedSuperUser -Db "postgres" -Sql "SELECT 1 FROM pg_database WHERE datname = '$safeDatabase'" -Password $authenticatedSuperPassword -Capture
$createdDatabase = $false
if ($dbExists -notmatch "1") {
    $createDb = Invoke-Psql -User $authenticatedSuperUser -Db "postgres" -Sql "CREATE DATABASE \"$Database\" OWNER \"$DbUser\";" -Password $authenticatedSuperPassword
    if ($createDb -ne 0) {
        throw "Falha ao criar banco '$Database'."
    }
    $createdDatabase = $true
}

$alterDbOwner = Invoke-Psql -User $authenticatedSuperUser -Db "postgres" -Sql "ALTER DATABASE \"$Database\" OWNER TO \"$DbUser\";" -Password $authenticatedSuperPassword
if ($alterDbOwner -ne 0) {
    throw "Falha ao definir o proprietario do banco '$Database'."
}

$ownershipSql = @"
ALTER SCHEMA public OWNER TO \"$DbUser\";
GRANT ALL ON SCHEMA public TO \"$DbUser\";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"$DbUser\";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO \"$DbUser\";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO \"$DbUser\";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"$DbUser\";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO \"$DbUser\";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO \"$DbUser\";
"@

$grantResult = Invoke-Psql -User $authenticatedSuperUser -Db $Database -Sql $ownershipSql -Password $authenticatedSuperPassword
if ($grantResult -ne 0) {
    throw "Falha ao ajustar permissoes no banco '$Database'."
}

if ($createdDatabase -and $AutoRestoreLatest) {
    $latestBackup = Get-ChildItem -Path $BackupRoot -Filter "frota-backup-*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($latestBackup) {
        $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("frota-restore-" + [guid]::NewGuid().ToString("N"))
        New-Item -Path $tempDir -ItemType Directory -Force | Out-Null

        try {
            Expand-Archive -LiteralPath $latestBackup.FullName -DestinationPath $tempDir -Force
            $sqlFile = Join-Path $tempDir "database.sql"
            if (-not (Test-Path $sqlFile)) {
                throw "Backup '$($latestBackup.FullName)' nao contem database.sql."
            }

            $restore = Invoke-PsqlFile -User $DbUser -Db $Database -FilePath $sqlFile -Password $DbPassword
            if ($restore -ne 0) {
                throw "Falha ao restaurar o backup '$($latestBackup.Name)' no banco '$Database'."
            }

            Write-Output "Backup restaurado com sucesso: $($latestBackup.Name)"
        }
        finally {
            Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    else {
        Write-Output "Nenhum backup encontrado em '$BackupRoot'. Banco criado sem restauracao."
    }
}

Write-Output "PostgreSQL local pronto em 127.0.0.1:$Port/$Database"
