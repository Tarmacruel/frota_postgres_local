[CmdletBinding()]
param(
    [Alias("Host")]
    [string]$PgHost = "localhost",
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
Set-StrictMode -Version Latest

$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($BackupRoot)) {
    $BackupRoot = Join-Path $repoRoot "storage\backups"
}

function Find-PostgresBin {
    $psql = Get-Command psql -ErrorAction SilentlyContinue
    if ($psql) {
        return Split-Path $psql.Source -Parent
    }

    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin" } |
        Where-Object { Test-Path (Join-Path $_ "psql.exe") }

    if ($candidates) {
        return ($candidates | Select-Object -First 1)
    }

    throw "Binarios do PostgreSQL nao encontrados em PATH ou C:\Program Files\PostgreSQL."
}

function Test-PortInUse {
    param([int]$PortToCheck)

    $connection = Get-NetTCPConnection -LocalPort $PortToCheck -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    return $null -ne $connection
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Quote-SqlIdentifier {
    param([Parameter(Mandatory = $true)][string]$Value)
    return '"' + ($Value -replace '"', '""') + '"'
}

function Quote-SqlLiteral {
    param([Parameter(Mandatory = $true)][string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$User,
        [Parameter(Mandatory = $true)][string]$DatabaseName,
        [string]$Sql = "",
        [string]$File = "",
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

    $psqlArgs = @(
        "-w",
        "-h", $PgHost,
        "-p", "$Port",
        "-U", $User,
        "-d", $DatabaseName,
        "-v", "ON_ERROR_STOP=1"
    )

    if ($Sql) {
        $psqlArgs += @("-tA", "-c", $Sql)
    }
    elseif ($File) {
        $psqlArgs += @("-f", $File)
    }

    try {
        if ($Capture) {
            return (& $script:PsqlExe @psqlArgs)
        }

        & $script:PsqlExe @psqlArgs
        if ($LASTEXITCODE -ne 0) {
            throw "psql retornou codigo $LASTEXITCODE."
        }
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

function Start-LocalCluster {
    if (Test-PortInUse -PortToCheck $Port) {
        Write-Host "PostgreSQL ja esta escutando na porta $Port." -ForegroundColor Green
        return
    }

    Ensure-Directory -Path (Split-Path $DataDir -Parent)

    if (-not (Test-Path -LiteralPath $DataDir)) {
        Write-Host "Inicializando cluster PostgreSQL em $DataDir..." -ForegroundColor Yellow
        $initArgs = @("-D", $DataDir, "-U", $SuperUser, "-E", "UTF8", "--locale=C")
        if (-not [string]::IsNullOrWhiteSpace($SuperPassword)) {
            $pwFile = Join-Path ([System.IO.Path]::GetTempPath()) "frota-pg-pw-$([guid]::NewGuid()).txt"
            Set-Content -LiteralPath $pwFile -Value $SuperPassword -Encoding ASCII
            try {
                $initArgs += @("--pwfile", $pwFile)
                & $script:InitDbExe @initArgs
            }
            finally {
                Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
            }
        }
        else {
            & $script:InitDbExe @initArgs
        }

        if ($LASTEXITCODE -ne 0) {
            throw "initdb falhou com codigo $LASTEXITCODE."
        }
    }

    Write-Host "Iniciando PostgreSQL local na porta $Port..." -ForegroundColor Yellow
    & $script:PgCtlExe -D $DataDir -o "-p $Port -h $PgHost" -w start
    if ($LASTEXITCODE -ne 0) {
        throw "pg_ctl start falhou com codigo $LASTEXITCODE."
    }
}

function Ensure-RoleAndDatabase {
    $superPasswordEffective = if ([string]::IsNullOrEmpty($SuperPassword)) { $DbPassword } else { $SuperPassword }
    $quotedUser = Quote-SqlIdentifier -Value $DbUser
    $quotedDb = Quote-SqlIdentifier -Value $Database
    $quotedPassword = Quote-SqlLiteral -Value $DbPassword

    $roleExists = Invoke-Psql -User $SuperUser -Password $superPasswordEffective -DatabaseName "postgres" -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$(($DbUser -replace "'", "''"))';" -Capture
    if (-not $roleExists) {
        Write-Host "Criando role $DbUser..." -ForegroundColor Yellow
        Invoke-Psql -User $SuperUser -Password $superPasswordEffective -DatabaseName "postgres" -Sql "CREATE ROLE $quotedUser LOGIN PASSWORD $quotedPassword;"
    }

    $databaseExists = Invoke-Psql -User $SuperUser -Password $superPasswordEffective -DatabaseName "postgres" -Sql "SELECT 1 FROM pg_database WHERE datname = '$(($Database -replace "'", "''"))';" -Capture
    if (-not $databaseExists) {
        Write-Host "Criando banco $Database..." -ForegroundColor Yellow
        Invoke-Psql -User $SuperUser -Password $superPasswordEffective -DatabaseName "postgres" -Sql "CREATE DATABASE $quotedDb OWNER $quotedUser;"
        return $true
    }

    Write-Host "Banco $Database ja existe." -ForegroundColor Green
    return $false
}

function Restore-LatestBackup {
    if (-not $AutoRestoreLatest) {
        return
    }

    if (-not (Test-Path -LiteralPath $BackupRoot)) {
        Write-Host "Nenhum diretorio de backup encontrado em $BackupRoot." -ForegroundColor Yellow
        return
    }

    $latestBackup = Get-ChildItem -LiteralPath $BackupRoot -Filter "frota-backup-*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latestBackup) {
        Write-Host "Nenhum backup encontrado em $BackupRoot." -ForegroundColor Yellow
        return
    }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "frota-restore-$([guid]::NewGuid())"
    try {
        Expand-Archive -LiteralPath $latestBackup.FullName -DestinationPath $tempDir -Force
        $sqlPath = Join-Path $tempDir "database.sql"
        if (-not (Test-Path -LiteralPath $sqlPath)) {
            throw "Backup '$($latestBackup.FullName)' nao contem database.sql."
        }

        Write-Host "Restaurando backup mais recente: $($latestBackup.Name)" -ForegroundColor Yellow
        Invoke-Psql -User $DbUser -Password $DbPassword -DatabaseName $Database -File $sqlPath
        Write-Host "Backup restaurado com sucesso." -ForegroundColor Green
    }
    finally {
        if (Test-Path -LiteralPath $tempDir) {
            Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$pgBin = Find-PostgresBin
$script:InitDbExe = Join-Path $pgBin "initdb.exe"
$script:PgCtlExe = Join-Path $pgBin "pg_ctl.exe"
$script:PsqlExe = Join-Path $pgBin "psql.exe"

Start-LocalCluster
$createdDatabase = Ensure-RoleAndDatabase
if ($createdDatabase) {
    Restore-LatestBackup
}

Write-Host "PostgreSQL local pronto em ${PgHost}:$Port/$Database." -ForegroundColor Green
