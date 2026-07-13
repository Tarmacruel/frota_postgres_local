[CmdletBinding()]
param(
    [string]$EnvPath = "",
    [string]$ServiceName = "postgresql-x64-16",
    [switch]$RestartService
)

$ErrorActionPreference = "Stop"
$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($EnvPath)) { $EnvPath = Join-Path $repoRoot "backend\.env" }
$EnvPath = [System.IO.Path]::GetFullPath($EnvPath)

function Get-EnvValue {
    param([string]$Name)
    $line = Get-Content -LiteralPath $EnvPath |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -First 1
    if (-not $line) { throw "$Name nao encontrada em $EnvPath" }
    return ($line -replace "^$([regex]::Escape($Name))=", "").Trim()
}

function Set-EnvValue {
    param([string]$Name, [string]$Value)
    $lines = @(Get-Content -LiteralPath $EnvPath)
    $escaped = [regex]::Escape($Name)
    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match "^$escaped=") { $found = $true; "$Name=$Value" } else { $line }
    }
    if (-not $found) { $updated += "$Name=$Value" }
    [IO.File]::WriteAllLines($EnvPath, $updated, (New-Object Text.UTF8Encoding($false)))
}

function Find-Psql {
    $command = Get-Command psql.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\psql.exe" } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if (-not $candidate) { throw "psql.exe nao encontrado." }
    return $candidate
}

function New-SecureToken {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$databaseUrl = [Uri](Get-EnvValue -Name "DATABASE_URL")
$databaseName = $databaseUrl.AbsolutePath.TrimStart("/")
$userParts = $databaseUrl.UserInfo.Split(":", 2)
$databaseUser = [Uri]::UnescapeDataString($userParts[0])
$currentPassword = if ($userParts.Count -gt 1) { [Uri]::UnescapeDataString($userParts[1]) } else { "" }
if ($databaseUser -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') { throw "Usuario PostgreSQL invalido." }

$newPassword = New-SecureToken
$sql = "ALTER ROLE `"$databaseUser`" PASSWORD '$newPassword'; ALTER SYSTEM SET listen_addresses = 'localhost';"
$psql = Find-Psql
$startInfo = New-Object Diagnostics.ProcessStartInfo
$startInfo.FileName = $psql
$startInfo.Arguments = "--host=$($databaseUrl.Host) --port=$($databaseUrl.Port) --username=$databaseUser --dbname=$databaseName --no-psqlrc --set=ON_ERROR_STOP=1"
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true
$startInfo.EnvironmentVariables["PGPASSWORD"] = $currentPassword

$process = New-Object Diagnostics.Process
$process.StartInfo = $startInfo
$null = $process.Start()
$process.StandardInput.WriteLine($sql)
$process.StandardInput.Close()
$output = $process.StandardOutput.ReadToEnd()
$errorOutput = $process.StandardError.ReadToEnd()
$process.WaitForExit()
if ($process.ExitCode -ne 0) { throw "Falha ao endurecer PostgreSQL: $errorOutput" }

$encodedUser = [Uri]::EscapeDataString($databaseUser)
$encodedPassword = [Uri]::EscapeDataString($newPassword)
$port = if ($databaseUrl.Port -gt 0) { $databaseUrl.Port } else { 5432 }
$newUrl = "postgresql+asyncpg://$encodedUser`:$encodedPassword@$($databaseUrl.Host)`:$port/$databaseName"
Set-EnvValue -Name "DATABASE_URL" -Value $newUrl

if ($RestartService) {
    Restart-Service -Name $ServiceName -Force
    (Get-Service -Name $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
}

Write-Host "PostgreSQL endurecido: senha rotacionada, listen_addresses=localhost e segredo nao exibido. Reinicio=$($RestartService.IsPresent)."
