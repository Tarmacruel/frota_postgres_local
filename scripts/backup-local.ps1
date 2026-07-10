[CmdletBinding()]
param(
    [string]$BackupRoot = "storage\backups",
    [string]$MirrorRoot = "",
    [string]$StorageRoot = "",
    [int]$RetentionCount = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$backendRoot = Join-Path $repoRoot "backend"
$envFile = Join-Path $backendRoot ".env"

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Get-EnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
    if (-not $line) {
        return $null
    }

    return ($line -replace "^$Name=", "").Trim()
}

function Find-PgDump {
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
        Where-Object { Test-Path $_ }

    if ($candidates) {
        return ($candidates | Select-Object -First 1)
    }

    throw "pg_dump nao foi encontrado. Instale o PostgreSQL client tools."
}

function Get-FileSha256 {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Remove-OldBackups {
    param(
        [string]$Path,
        [int]$KeepCount
    )

    Ensure-Directory -Path $Path

    Get-ChildItem -LiteralPath $Path -Filter "frota-backup-*.zip" -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $KeepCount |
        ForEach-Object {
            $shaFile = "$($_.FullName).sha256.txt"
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
            if (Test-Path -LiteralPath $shaFile) {
                Remove-Item -LiteralPath $shaFile -Force -ErrorAction SilentlyContinue
            }
        }
}

function Get-NormalizedPath {
    param([string]$Path)

    $trimChars = [char[]]@(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )

    return ([System.IO.Path]::GetFullPath($Path)).TrimEnd($trimChars)
}

$databaseUrl = Get-EnvValue -Path $envFile -Name "DATABASE_URL"
if (-not $databaseUrl) {
    throw "DATABASE_URL nao encontrada em backend\.env"
}

$uri = [System.Uri]$databaseUrl
$dbName = $uri.AbsolutePath.TrimStart("/")
$userInfo = $uri.UserInfo.Split(":", 2)
$dbUser = $userInfo[0]
$dbPassword = if ($userInfo.Count -gt 1) { $userInfo[1] } else { "" }
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$storageRootValue = if (-not [string]::IsNullOrWhiteSpace($StorageRoot)) { $StorageRoot } else { Get-EnvValue -Path $envFile -Name "STORAGE_DIR" }
if ([string]::IsNullOrWhiteSpace($storageRootValue)) {
    $storageRootValue = Join-Path $backendRoot "storage"
}
$storageRootAbsolute = if ([System.IO.Path]::IsPathRooted($storageRootValue)) { $storageRootValue } else { Join-Path $backendRoot $storageRootValue }

$backupRootAbsolute = if ([System.IO.Path]::IsPathRooted($BackupRoot)) { $BackupRoot } else { Join-Path $repoRoot $BackupRoot }
Ensure-Directory -Path $backupRootAbsolute

$mirrorRootAbsolute = $null
if (-not [string]::IsNullOrWhiteSpace($MirrorRoot)) {
    $mirrorRootAbsolute = if ([System.IO.Path]::IsPathRooted($MirrorRoot)) { $MirrorRoot } else { Join-Path $repoRoot $MirrorRoot }
    Ensure-Directory -Path $mirrorRootAbsolute
}

$lockFile = Join-Path $backupRootAbsolute ".backup.lock"
if (Test-Path -LiteralPath $lockFile) {
    throw "Ja existe uma rotina de backup em andamento."
}

try {
    Set-Content -LiteralPath $lockFile -Value "started=$(Get-Date -Format s)" -Encoding UTF8

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $workDir = Join-Path $backupRootAbsolute $timestamp
    $archivePath = Join-Path $backupRootAbsolute "frota-backup-$timestamp.zip"
    $sqlPath = Join-Path $workDir "database.sql"
    $metaPath = Join-Path $workDir "metadata.json"
    $envBackupPath = Join-Path $workDir ".env.backup"
    $storageBackupPath = Join-Path $workDir "storage"
    $mirrorArchivePath = $null

    Ensure-Directory -Path $workDir

    $pgDump = Find-PgDump

    Write-Host "Gerando dump PostgreSQL..." -ForegroundColor Yellow
    $env:PGPASSWORD = $dbPassword
    try {
        & $pgDump `
            --host=$dbHost `
            --port=$dbPort `
            --username=$dbUser `
            --dbname=$dbName `
            --file=$sqlPath `
            --no-owner `
            --no-privileges

        if ($LASTEXITCODE -ne 0) {
            throw "Falha ao gerar dump PostgreSQL."
        }
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $envFile) {
        Copy-Item -LiteralPath $envFile -Destination $envBackupPath -Force
    }

    $storageIncluded = $false
    if (Test-Path -LiteralPath $storageRootAbsolute) {
        Write-Host "Copiando anexos e comprovantes..." -ForegroundColor Yellow
        Ensure-Directory -Path $storageBackupPath
        $robocopy = Get-Command robocopy.exe -ErrorAction SilentlyContinue
        if (-not $robocopy) {
            throw "robocopy.exe nao encontrado para copiar STORAGE_DIR."
        }

        & $robocopy.Source $storageRootAbsolute $storageBackupPath /E /R:2 /W:2 /XJ /NFL /NDL /NP | Out-Null
        if ($LASTEXITCODE -ge 8) {
            throw "Falha ao copiar STORAGE_DIR para o backup. Codigo robocopy: $LASTEXITCODE."
        }
        $storageIncluded = $true
    }
    else {
        Write-Host "STORAGE_DIR nao encontrado; backup seguira apenas com banco e .env: $storageRootAbsolute" -ForegroundColor Yellow
    }

    $metadata = [ordered]@{
        system = "Frota PMTF"
        generatedAt = (Get-Date).ToString("s")
        root = $repoRoot
        database = [ordered]@{
            host = $dbHost
            port = $dbPort
            name = $dbName
            user = $dbUser
        }
        files = [ordered]@{
            databaseSql = (Split-Path $sqlPath -Leaf)
            envBackup   = (Split-Path $envBackupPath -Leaf)
            storage     = if ($storageIncluded) { "storage" } else { $null }
        }
        storage = [ordered]@{
            source   = $storageRootAbsolute
            included = $storageIncluded
        }
        mirror = if ($mirrorRootAbsolute) { $mirrorRootAbsolute } else { $null }
    } | ConvertTo-Json -Depth 5

    Set-Content -LiteralPath $metaPath -Value $metadata -Encoding UTF8

    Write-Host "Compactando backup..." -ForegroundColor Yellow
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    [System.IO.Compression.ZipFile]::CreateFromDirectory($workDir, $archivePath)

    $archiveSha = Get-FileSha256 -Path $archivePath
    $archiveShaPath = "$archivePath.sha256.txt"
    Set-Content -LiteralPath $archiveShaPath -Value $archiveSha -Encoding ASCII

    if ($mirrorRootAbsolute) {
        Write-Host "Espelhando backup..." -ForegroundColor Yellow
        $mirrorArchivePath = Join-Path $mirrorRootAbsolute (Split-Path $archivePath -Leaf)
        $mirrorShaPath = "$mirrorArchivePath.sha256.txt"

        Copy-Item -LiteralPath $archivePath -Destination $mirrorArchivePath -Force
        Copy-Item -LiteralPath $archiveShaPath -Destination $mirrorShaPath -Force

        $mirrorArchiveSha = Get-FileSha256 -Path $mirrorArchivePath
        if ($mirrorArchiveSha -ne $archiveSha) {
            throw "Falha ao validar a copia espelhada do backup."
        }
    }

    Remove-Item -LiteralPath $workDir -Recurse -Force

    Remove-OldBackups -Path $backupRootAbsolute -KeepCount $RetentionCount
    if ($mirrorRootAbsolute -and ((Get-NormalizedPath $mirrorRootAbsolute) -ne (Get-NormalizedPath $backupRootAbsolute))) {
        Remove-OldBackups -Path $mirrorRootAbsolute -KeepCount $RetentionCount
    }

    Write-Host "Backup concluido com sucesso." -ForegroundColor Green
    Write-Host "Arquivo: $archivePath"
    if ($mirrorArchivePath) {
        Write-Host "Espelho: $mirrorArchivePath"
    }
}
finally {
    if (Test-Path -LiteralPath $lockFile) {
        Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
    }
}
