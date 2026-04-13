param(
    [string]$Host = "127.0.0.1",
    [int]$Port = 5434,
    [string]$Database = "frota_db",
    [string]$DbUser = "frota_user",
    [string]$DbPassword = "frota_secret",
    [string]$OutputDir = "$env:LOCALAPPDATA\FrotaPMTF\backups"
)

$ErrorActionPreference = "Stop"

$pgDumpExe = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
if (-not (Test-Path $pgDumpExe)) {
    throw "pg_dump.exe nao encontrado em '$pgDumpExe'."
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outputFile = Join-Path $OutputDir "frota_backup_${Database}_$timestamp.sql"

$env:PGPASSWORD = $DbPassword
try {
    & $pgDumpExe -h $Host -p $Port -U $DbUser -d $Database -f $outputFile
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump retornou codigo $LASTEXITCODE"
    }
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Output "Backup concluido: $outputFile"
