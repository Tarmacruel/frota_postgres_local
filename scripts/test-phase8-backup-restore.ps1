[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [string]$EvidencePath = "storage\logs\phase8-migration-rehearsal.json"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$backendRoot = Join-Path $repoRoot "backend"
$envPath = Join-Path $backendRoot ".env"
$backupFull = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BackupPath))
$backupRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "storage\backups"))
if (-not $backupFull.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "O ensaio aceita somente backup dentro de $backupRoot"
}
if (-not (Test-Path -LiteralPath $backupFull)) { throw "Backup nao encontrado: $backupFull" }

function Get-EnvValue {
    param([string]$Name)
    $line = Get-Content -LiteralPath $envPath |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -First 1
    if (-not $line) { throw "$Name nao encontrada em backend\.env" }
    return ($line -replace "^$([regex]::Escape($Name))=", "").Trim()
}

function Find-PgTool {
    param([string]$Name)
    $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if (-not $candidate) { throw "$Name.exe nao encontrado." }
    return $candidate
}

$sourceUrl = [Uri](Get-EnvValue -Name "DATABASE_URL")
$userParts = $sourceUrl.UserInfo.Split(":", 2)
$dbUser = [Uri]::UnescapeDataString($userParts[0])
$dbPassword = if ($userParts.Count -gt 1) { [Uri]::UnescapeDataString($userParts[1]) } else { "" }
$dbPort = if ($sourceUrl.Port -gt 0) { $sourceUrl.Port } else { 5432 }
$databaseName = "frota_phase8_restore_$(Get-Date -Format 'yyyyMMddHHmmss')"
if ($databaseName -notmatch '^frota_phase8_restore_[0-9]{14}$') { throw "Nome descartavel invalido." }

$workRoot = Join-Path $backupRoot "restore-work-$databaseName"
$workFull = [System.IO.Path]::GetFullPath($workRoot)
if (-not $workFull.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "Diretorio temporario invalido." }
$sqlPath = Join-Path $workFull "database.sql"
$createdb = Find-PgTool -Name "createdb"
$dropdb = Find-PgTool -Name "dropdb"
$psql = Find-PgTool -Name "psql"
$alembic = Join-Path $backendRoot ".venv\Scripts\alembic.exe"

function Invoke-ScalarSql {
    param([string]$Sql)
    $value = & $psql --host=$($sourceUrl.Host) --port=$dbPort --username=$dbUser --dbname=$databaseName --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command=$Sql
    if ($LASTEXITCODE -ne 0) { throw "Consulta do ensaio falhou." }
    return ($value | Select-Object -Last 1).Trim()
}

function Get-CriticalCounts {
    $tables = @(
        "users",
        "vehicles",
        "vehicle_possession",
        "vehicle_possession_trip",
        "vehicle_possession_trip_destination",
        "vehicle_possession_return_confirmation",
        "audit_logs"
    )
    $result = [ordered]@{}
    foreach ($table in $tables) {
        $result[$table] = [int64](Invoke-ScalarSql -Sql "SELECT count(*) FROM $table")
    }
    return $result
}

$oldDatabaseUrl = $env:DATABASE_URL
$env:PGPASSWORD = $dbPassword
$created = $false
try {
    New-Item -ItemType Directory -Path $workFull -Force | Out-Null
    $archive = [IO.Compression.ZipFile]::OpenRead($backupFull)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName -eq "database.sql" } | Select-Object -First 1
        if (-not $entry) { throw "database.sql ausente no backup." }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $sqlPath, $true)
    }
    finally { $archive.Dispose() }

    & $createdb --host=$($sourceUrl.Host) --port=$dbPort --username=$dbUser --encoding=UTF8 $databaseName
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar banco descartavel." }
    $created = $true

    & $psql --host=$($sourceUrl.Host) --port=$dbPort --username=$dbUser --dbname=$databaseName --no-psqlrc --set=ON_ERROR_STOP=1 --file=$sqlPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao restaurar backup no banco descartavel." }

    $revisionBefore = Invoke-ScalarSql -Sql "SELECT version_num FROM alembic_version"
    $countsBefore = Get-CriticalCounts
    $temporaryPassword = [Uri]::EscapeDataString($dbPassword)
    $env:DATABASE_URL = "postgresql+asyncpg://$dbUser`:$temporaryPassword@$($sourceUrl.Host)`:$dbPort/$databaseName"

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    Push-Location $backendRoot
    try {
        & $alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Migration falhou no banco restaurado." }
        & $alembic check
        if ($LASTEXITCODE -ne 0) { throw "alembic check falhou no banco restaurado." }
    }
    finally { Pop-Location }
    $stopwatch.Stop()

    $revisionAfter = Invoke-ScalarSql -Sql "SELECT version_num FROM alembic_version"
    $countsAfter = Get-CriticalCounts
    $preferenceRows = [int64](Invoke-ScalarSql -Sql "SELECT count(*) FROM user_report_preferences")
    $preferenceConstraints = [int64](Invoke-ScalarSql -Sql "SELECT count(*) FROM pg_constraint WHERE conrelid = 'user_report_preferences'::regclass")

    $evidence = [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        backup = [IO.Path]::GetFileName($backupFull)
        backupSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFull).Hash
        restoredDatabase = $databaseName
        revisionBefore = $revisionBefore
        revisionAfter = $revisionAfter
        migrationDurationMs = $stopwatch.ElapsedMilliseconds
        countsBefore = $countsBefore
        countsAfter = $countsAfter
        preferenceRows = $preferenceRows
        preferenceConstraints = $preferenceConstraints
        restored = $true
        droppedAfterValidation = $true
    }
    $evidenceFull = if ([IO.Path]::IsPathRooted($EvidencePath)) { $EvidencePath } else { Join-Path $repoRoot $EvidencePath }
    New-Item -ItemType Directory -Path (Split-Path $evidenceFull -Parent) -Force | Out-Null
    $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidenceFull -Encoding UTF8
    $evidence | ConvertTo-Json -Depth 6
}
finally {
    if ($created) {
        & $dropdb --host=$($sourceUrl.Host) --port=$dbPort --username=$dbUser --if-exists $databaseName
    }
    if ($null -eq $oldDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $oldDatabaseUrl }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $workFull) {
        $resolvedWork = [IO.Path]::GetFullPath($workFull)
        if ($resolvedWork.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedWork -Recurse -Force
        }
    }
}
