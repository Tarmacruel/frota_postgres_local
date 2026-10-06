[CmdletBinding()]
param(
    [string]$BackupRoot = "",
    [switch]$WaitUntilCutoff,
    [switch]$ForceEvenIfUnchanged,
    [switch]$RequireSyntheticTargets
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Assert-HmlRepository
$worktreeChanges = @(& git -C $repoRoot status --porcelain)
if ($LASTEXITCODE -ne 0 -or $worktreeChanges.Count -gt 0) {
    throw "Refresh requires a clean, committed worktree so the restored schema can be tied to an exact commit."
}
$mount = Assert-HmlSecureVolume
$config = Get-HmlConfiguration
$refreshRoot = Join-Path $mount "refresh"
$runtimeRoot = Join-Path $mount "runtime"
$snapshotsRoot = Join-Path $mount "snapshots"
$activeStorage = Join-Path $mount "data\uploads"
$activeArtifacts = Join-Path $mount "data\artifacts"
$manifestPath = Join-Path $refreshRoot "last-success.json"
$lockPath = Join-Path $refreshRoot "refresh.lock"
foreach ($path in @($refreshRoot, $runtimeRoot, $snapshotsRoot, (Split-Path $activeStorage -Parent))) {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}

function Invoke-HmlPsql {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [string]$Sql = "",
        [string]$File = "",
        [switch]$AsApplicationUser,
        [switch]$Capture
    )

    $pgBin = Find-HmlPostgresBin
    $user = if ($AsApplicationUser) { $config.database.applicationUser } else { $config.database.superUser }
    $password = if ($AsApplicationUser) { $config.database.applicationPassword } else { $config.database.superPassword }
    $arguments = @("-w", "-h", "127.0.0.1", "-p", "5440", "-U", $user, "-d", $Database, "-v", "ON_ERROR_STOP=1")
    if ($Sql) { $arguments += @("-tA", "-c", $Sql) }
    if ($File) { $arguments += @("-f", $File) }

    $oldPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $password
    try {
        if ($Capture) {
            $output = & (Join-Path $pgBin "psql.exe") @arguments
            if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE." }
            return (($output | Out-String).Trim())
        }
        & (Join-Path $pgBin "psql.exe") @arguments
        if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE." }
    }
    finally {
        if ($null -eq $oldPassword) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD = $oldPassword }
    }
}

function Test-HmlEnvironmentIdle {
    foreach ($name in @("frontend", "backend", "signer-agent")) {
        if (Get-HmlOwnedProcess -Name $name -RuntimeRoot $runtimeRoot) { return $false }
    }
    foreach ($port in @(3010, 8010, 54174)) {
        if (Test-HmlPortListening -Port $port) { return $false }
    }
    if (-not (Test-HmlPortListening -Port 5440)) { return $true }
    if (-not (Test-HmlPostgresOwned)) { throw "Port 5440 is not owned by the isolated homologation cluster." }
    $connections = [int](Invoke-HmlPsql -Database "postgres" -Sql "SELECT count(*) FROM pg_stat_activity WHERE datname = 'frota_hml';" -Capture)
    return $connections -eq 0
}

function Wait-HmlIdle {
    if (Test-HmlEnvironmentIdle) { return $true }
    if (-not $WaitUntilCutoff) { return $false }

    $cutoff = (Get-Date).Date.AddHours([int]$config.refresh.cutoffHour)
    if ((Get-Date) -ge $cutoff) { return $false }
    do {
        $minutes = [int]$config.refresh.retryMinutes
        Write-Warning "Homologation is in use. Refresh will retry in $minutes minutes."
        Start-Sleep -Seconds ($minutes * 60)
        if (Test-HmlEnvironmentIdle) { return $true }
    } while ((Get-Date) -lt $cutoff)
    return $false
}

function Resolve-HmlBackupRoot {
    $allowed = @($config.productionBackupRoots | ForEach-Object { Get-HmlNormalizedPath $_ })
    if ($allowed.Count -eq 0) { throw "No production backup root is allowlisted." }
    if ($BackupRoot) {
        $requested = Get-HmlNormalizedPath $BackupRoot
        if (-not ($allowed | Where-Object { $_ -ieq $requested })) {
            throw "Backup root is not allowlisted: '$requested'."
        }
        return @($requested)
    }
    return $allowed
}

function Select-HmlBackup {
    $candidates = foreach ($root in Resolve-HmlBackupRoot) {
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        Get-ChildItem -LiteralPath $root -File -Filter "frota-backup-*.zip" -ErrorAction SilentlyContinue
    }
    $backup = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $backup) { throw "No production backup was found in the allowlisted roots." }

    $age = (Get-Date) - $backup.LastWriteTime
    if ($age.TotalMinutes -lt [int]$config.refresh.minimumBackupAgeMinutes) { throw "Newest backup is too recent and may still be changing." }
    if ($age.TotalHours -gt [int]$config.refresh.maximumBackupAgeHours) { throw "Newest backup is older than the configured maximum age." }
    $shaPath = "$($backup.FullName).sha256.txt"
    if (-not (Test-Path -LiteralPath $shaPath -PathType Leaf)) { throw "Checksum sidecar is missing for '$($backup.Name)'." }
    $sidecar = Get-Content -LiteralPath $shaPath -Raw
    $match = [regex]::Match($sidecar, '(?i)\b[0-9a-f]{64}\b')
    if (-not $match.Success) { throw "Checksum sidecar has an invalid format." }

    $initialLength = $backup.Length
    $initialWrite = $backup.LastWriteTimeUtc
    Start-Sleep -Seconds ([int]$config.refresh.stabilityCheckSeconds)
    $backup.Refresh()
    if ($backup.Length -ne $initialLength -or $backup.LastWriteTimeUtc -ne $initialWrite) { throw "Backup changed during the stability check." }

    $actual = (Get-FileHash -LiteralPath $backup.FullName -Algorithm SHA256).Hash
    if ($actual -ine $match.Value) { throw "Backup SHA-256 does not match its sidecar." }
    return [pscustomobject]@{ File = $backup; Sha256 = $actual }
}

function Expand-HmlBackupSelective {
    param(
        [Parameter(Mandatory = $true)][string]$ArchivePath,
        [Parameter(Mandatory = $true)][string]$StageRoot
    )

    Assert-HmlPathWithin -Path $StageRoot -Root $refreshRoot -Label "Refresh stage"
    New-Item -ItemType Directory -Path $StageRoot -Force | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $databaseFound = $false
        $metadataFound = $false
        [long]$totalBytes = 0
        [long]$databaseBytes = 0
        [int]$fileCount = 0
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName.Replace('/', '\')
            if (-not (Test-HmlZipEntrySafe -EntryName $name)) { throw "Unsafe ZIP entry: '$name'." }
            if (-not $seen.Add($name)) { throw "Duplicate ZIP entry: '$name'." }
            if ($name -ieq ".env.backup" -or $name -match '(^|\\)\.env($|\.)') { continue }

            $allowed = $name -ieq "database.sql" -or $name -ieq "metadata.json" -or $name.StartsWith("storage\", [StringComparison]::OrdinalIgnoreCase)
            if (-not $allowed) { throw "Unexpected backup entry was rejected: '$name'." }
            if ([string]::IsNullOrEmpty($entry.Name)) { continue }
            $totalBytes += $entry.Length
            $fileCount++
            if ($name -ieq "database.sql") { $databaseFound = $true; $databaseBytes = $entry.Length }
            if ($name -ieq "metadata.json") { $metadataFound = $true }
        }
        if (-not $databaseFound -or -not $metadataFound) { throw "Backup must contain database.sql and metadata.json." }

        $volume = Get-HmlVolumeForPath -Path $mount
        $estimatedRequired = $totalBytes + (3 * $databaseBytes) + 1GB
        if ($estimatedRequired -gt ($volume.SizeRemaining - $script:HmlMinimumFreeBytes)) {
            throw "Backup expansion and database restore would violate the 10 GB free-space reserve."
        }

        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName.Replace('/', '\')
            if ($name -ieq ".env.backup" -or $name -match '(^|\\)\.env($|\.)' -or [string]::IsNullOrEmpty($entry.Name)) { continue }
            $target = Join-Path $StageRoot $name
            Assert-HmlPathWithin -Path $target -Root $StageRoot -Label "ZIP extraction target"
            $parent = Split-Path $target -Parent
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
        }

        $metadata = Get-Content -LiteralPath (Join-Path $StageRoot "metadata.json") -Raw | ConvertFrom-Json
        if ($metadata.system -ne "Frota PMTF" -or $metadata.files.databaseSql -ne "database.sql") { throw "Backup metadata is not from the expected system." }
        if ($metadata.database.host -ne "127.0.0.1" -or [int]$metadata.database.port -ne 5432 -or $metadata.database.name -ne "frota_db") {
            throw "Backup metadata does not identify the expected production database."
        }
        if (-not $metadata.storage.included -or $metadata.files.storage -ne "storage" -or -not (Test-Path -LiteralPath (Join-Path $StageRoot "storage") -PathType Container)) {
            throw "A complete production storage snapshot is required."
        }
        $generatedAt = [datetime]::MinValue
        if (-not [datetime]::TryParse([string]$metadata.generatedAt, [ref]$generatedAt)) { throw "Backup generatedAt metadata is invalid." }
        $metadataAge = (Get-Date) - $generatedAt
        if ($metadataAge.TotalMinutes -lt -5 -or $metadataAge.TotalHours -gt [int]$config.refresh.maximumBackupAgeHours) {
            throw "Backup metadata timestamp is outside the accepted refresh window."
        }
        return [pscustomobject]@{ FileCount = $fileCount; TotalBytes = $totalBytes; MetadataGeneratedAt = $metadata.generatedAt }
    }
    finally { $zip.Dispose() }
}

function Invoke-HmlMigrations {
    param([Parameter(Mandatory = $true)][string]$DatabaseName)

    $envPath = Join-Path $mount "config\backend.env"
    $values = Read-HmlEnvFile -Path $envPath
    $applicationPassword = [Uri]::EscapeDataString([string]$config.database.applicationPassword)
    $values["DATABASE_URL"] = "postgresql+asyncpg://$($config.database.applicationUser):$applicationPassword@127.0.0.1:5440/$DatabaseName"
    $previous = @{}
    foreach ($name in $values.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
        [Environment]::SetEnvironmentVariable($name, [string]$values[$name], "Process")
    }
    try {
        $python = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
        if (-not (Test-Path -LiteralPath $python)) { throw "Backend virtualenv is missing." }
        Push-Location (Join-Path $repoRoot "backend")
        try {
            & $python -m alembic upgrade head
            if ($LASTEXITCODE -ne 0) { throw "Alembic migration failed on the temporary database." }

            $hook = Join-Path $repoRoot $config.syntheticTargetHook
            if (Test-Path -LiteralPath $hook -PathType Leaf) {
                $oldRefresh = $env:HOMOLOGATION_REFRESH
                $env:HOMOLOGATION_REFRESH = "1"
                try {
                    & $python $hook
                    if ($LASTEXITCODE -ne 0) { throw "Synthetic signing target hook failed." }
                }
                finally {
                    if ($null -eq $oldRefresh) { Remove-Item Env:HOMOLOGATION_REFRESH -ErrorAction SilentlyContinue } else { $env:HOMOLOGATION_REFRESH = $oldRefresh }
                }
                return $true
            }
            if ($RequireSyntheticTargets) { throw "Synthetic signing target hook is required but not implemented yet: '$hook'." }
            Write-Warning "Synthetic signing target hook is not present yet; certificate signing remains disabled."
            return $false
        }
        finally { Pop-Location }
    }
    finally {
        foreach ($name in $values.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process") }
    }
}

function Switch-HmlDatabase {
    param([Parameter(Mandatory = $true)][string]$TemporaryDatabase)

    if ($TemporaryDatabase -notmatch '^frota_hml_refresh_[0-9]{14}$') { throw "Unsafe temporary database name." }
    Invoke-HmlPsql -Database "postgres" -Sql "DROP DATABASE IF EXISTS frota_hml_previous WITH (FORCE);"
    try {
        Invoke-HmlPsql -Database "postgres" -Sql "ALTER DATABASE frota_hml RENAME TO frota_hml_previous;"
        Invoke-HmlPsql -Database "postgres" -Sql "ALTER DATABASE $TemporaryDatabase RENAME TO frota_hml;"
    }
    catch {
        try {
            $activeExists = Invoke-HmlPsql -Database "postgres" -Sql "SELECT 1 FROM pg_database WHERE datname='frota_hml';" -Capture
            if (-not $activeExists) { Invoke-HmlPsql -Database "postgres" -Sql "ALTER DATABASE frota_hml_previous RENAME TO frota_hml;" }
        }
        catch { Write-Warning "Automatic database rollback failed; manual recovery is required before startup." }
        throw
    }
}

function Switch-HmlStorage {
    param([Parameter(Mandatory = $true)][string]$StagedStorage)

    $previousRoot = Join-Path $snapshotsRoot "previous"
    $previousStorage = Join-Path $previousRoot "uploads"
    $previousArtifacts = Join-Path $previousRoot "artifacts"
    Assert-HmlPathWithin -Path $StagedStorage -Root $refreshRoot -Label "Staged storage"
    Assert-HmlPathWithin -Path $activeStorage -Root $mount -Label "Active storage"
    Assert-HmlPathWithin -Path $activeArtifacts -Root $mount -Label "Active artifacts"
    Assert-HmlPathWithin -Path $previousStorage -Root $snapshotsRoot -Label "Previous storage"
    if (-not (Test-Path -LiteralPath $StagedStorage -PathType Container)) { New-Item -ItemType Directory -Path $StagedStorage -Force | Out-Null }

    Remove-HmlSafeTree -Path $previousRoot -AllowedRoot $snapshotsRoot
    New-Item -ItemType Directory -Path $previousRoot -Force | Out-Null
    if (Test-Path -LiteralPath $activeStorage) { Move-Item -LiteralPath $activeStorage -Destination $previousStorage }
    if (Test-Path -LiteralPath $activeArtifacts) { Move-Item -LiteralPath $activeArtifacts -Destination $previousArtifacts }
    try {
        Move-Item -LiteralPath $StagedStorage -Destination $activeStorage
        New-Item -ItemType Directory -Path $activeArtifacts -Force | Out-Null
    }
    catch {
        if (-not (Test-Path -LiteralPath $activeStorage) -and (Test-Path -LiteralPath $previousStorage)) {
            Move-Item -LiteralPath $previousStorage -Destination $activeStorage
        }
        if (-not (Test-Path -LiteralPath $activeArtifacts) -and (Test-Path -LiteralPath $previousArtifacts)) {
            Move-Item -LiteralPath $previousArtifacts -Destination $activeArtifacts
        }
        throw
    }
    return [pscustomobject]@{ Storage = $previousStorage; Artifacts = $previousArtifacts }
}

$lockStream = $null
$stageRoot = $null
$temporaryDatabase = $null
try {
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    if (-not (Wait-HmlIdle)) {
        Write-HmlAuditLog -Event "refresh_deferred" -Data @{ reason = "environment_in_use"; cutoffHour = [int]$config.refresh.cutoffHour }
        Write-Warning "Refresh deferred because homologation remained in use."
        exit 2
    }

    Start-HmlPostgres -Config $config
    $selected = Select-HmlBackup
    if (-not $ForceEvenIfUnchanged -and (Test-Path -LiteralPath $manifestPath)) {
        $last = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($last.backupSha256 -eq $selected.Sha256) {
            Write-Host "Latest validated production backup is already active; no refresh needed."
            exit 0
        }
    }

    $stamp = Get-Date -Format "yyyyMMddHHmmss"
    $stageRoot = Join-Path $refreshRoot "stage-$stamp"
    $temporaryDatabase = "frota_hml_refresh_$stamp"
    $expanded = Expand-HmlBackupSelective -ArchivePath $selected.File.FullName -StageRoot $stageRoot

    Invoke-HmlPsql -Database "postgres" -Sql "CREATE DATABASE $temporaryDatabase OWNER `"$($config.database.applicationUser)`";"
    Invoke-HmlPsql -Database $temporaryDatabase -File (Join-Path $stageRoot "database.sql") -AsApplicationUser
    $syntheticTargetsCreated = Invoke-HmlMigrations -DatabaseName $temporaryDatabase
    $tableCount = [int](Invoke-HmlPsql -Database $temporaryDatabase -Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" -AsApplicationUser -Capture)
    if ($tableCount -le 0) { throw "Temporary database failed the public table integrity check." }

    $previousData = Switch-HmlStorage -StagedStorage (Join-Path $stageRoot "storage")
    try {
        Switch-HmlDatabase -TemporaryDatabase $temporaryDatabase
        $temporaryDatabase = $null
    }
    catch {
        if (Test-Path -LiteralPath $previousData.Storage) {
            if (Test-Path -LiteralPath $activeStorage) { Remove-HmlSafeTree -Path $activeStorage -AllowedRoot (Split-Path $activeStorage -Parent) }
            Move-Item -LiteralPath $previousData.Storage -Destination $activeStorage
        }
        if (Test-Path -LiteralPath $previousData.Artifacts) {
            if (Test-Path -LiteralPath $activeArtifacts) { Remove-HmlSafeTree -Path $activeArtifacts -AllowedRoot (Split-Path $activeArtifacts -Parent) }
            Move-Item -LiteralPath $previousData.Artifacts -Destination $activeArtifacts
        }
        throw
    }

    $commit = (& git -C $repoRoot rev-parse HEAD).Trim()
    $manifest = [ordered]@{
        schemaVersion = 1
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
        backupFile = $selected.File.Name
        backupSha256 = $selected.Sha256
        backupGeneratedAt = $expanded.MetadataGeneratedAt
        commit = $commit
        databaseTableCount = $tableCount
        extractedFileCount = $expanded.FileCount
        extractedBytes = $expanded.TotalBytes
        syntheticTargetsCreated = [bool]$syntheticTargetsCreated
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
    Write-HmlAuditLog -Event "refresh_completed" -Data @{ backupFile = $selected.File.Name; backupSha256 = $selected.Sha256; commit = $commit; tableCount = $tableCount; extractedFileCount = $expanded.FileCount; syntheticTargetsCreated = [bool]$syntheticTargetsCreated }
    Write-Host "Homologation refresh completed from '$($selected.File.Name)'." -ForegroundColor Green
}
catch {
    if ($temporaryDatabase -and (Test-HmlPortListening -Port 5440) -and (Test-HmlPostgresOwned)) {
        try { Invoke-HmlPsql -Database "postgres" -Sql "DROP DATABASE IF EXISTS $temporaryDatabase WITH (FORCE);" } catch { Write-Warning "Temporary database cleanup failed: $temporaryDatabase" }
    }
    Write-HmlAuditLog -Event "refresh_failed" -Data @{ errorType = $_.Exception.GetType().FullName; stage = if ($stageRoot) { Split-Path $stageRoot -Leaf } else { $null } }
    throw
}
finally {
    if ($stageRoot -and (Test-Path -LiteralPath $stageRoot)) { Remove-HmlSafeTree -Path $stageRoot -AllowedRoot $refreshRoot }
    if ($lockStream) { $lockStream.Dispose() }
}
