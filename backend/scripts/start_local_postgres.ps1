param(
    [int]$Port = 5432,
    [string]$Database = "frota_db",
    [string]$DbUser = "frota_user",
    [string]$DbPassword = "frota_secret",
    [string]$SuperUser = "frota_user",
    [string]$SuperPassword = ""
)

$repoRootScript = Join-Path $PSScriptRoot "..\..\scripts\start_local_postgres.ps1"
$resolvedScript = (Resolve-Path $repoRootScript).Path

& powershell -NoProfile -ExecutionPolicy Bypass -File $resolvedScript -Port $Port -Database $Database -DbUser $DbUser -DbPassword $DbPassword -SuperUser $SuperUser -SuperPassword $SuperPassword
exit $LASTEXITCODE
