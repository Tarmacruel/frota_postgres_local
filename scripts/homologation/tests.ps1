[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

$failures = New-Object Collections.Generic.List[string]
function Assert-Test {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { $script:failures.Add($Message) }
}

foreach ($scriptFile in Get-ChildItem -LiteralPath $PSScriptRoot -Filter "*.ps1" -File) {
    $tokens = $null
    $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$tokens, [ref]$errors)
    Assert-Test -Condition ($errors.Count -eq 0) -Message "$($scriptFile.Name) has PowerShell parser errors."
}

Assert-Test -Condition ($script:HmlExpectedRoot -eq "D:\FROTAS\frota_certificado_homologacao") -Message "Repository root changed unexpectedly."
Assert-Test -Condition ($script:HmlExpectedBranch -eq "feature/certificado-digital-hml") -Message "Homologation branch changed unexpectedly."
Assert-Test -Condition ($script:HmlPorts.Frontend -eq 3010 -and $script:HmlPorts.Backend -eq 8010 -and $script:HmlPorts.Postgres -eq 5440 -and $script:HmlPorts.SignerAgent -eq 54174) -Message "Fixed homologation ports changed unexpectedly."
Assert-Test -Condition (Test-HmlPathWithin -Path "D:\FROTAS\frota_certificado_homologacao\.runtime-secure\data\uploads" -Root "D:\FROTAS\frota_certificado_homologacao\.runtime-secure") -Message "Valid child path was rejected."
Assert-Test -Condition (-not (Test-HmlPathWithin -Path "D:\FROTAS\frota_certificado_homologacao-evil" -Root "D:\FROTAS\frota_certificado_homologacao")) -Message "Sibling prefix path was accepted."

foreach ($entry in @("database.sql", "metadata.json", "storage\folder\file.pdf")) {
    Assert-Test -Condition (Test-HmlZipEntrySafe -EntryName $entry) -Message "Safe ZIP entry was rejected: $entry"
}
foreach ($entry in @("..\database.sql", "storage\..\secret", "C:\secret", "\\server\share\file")) {
    Assert-Test -Condition (-not (Test-HmlZipEntrySafe -EntryName $entry)) -Message "Unsafe ZIP entry was accepted: $entry"
}

$configPath = Join-Path $PSScriptRoot "homologation.config.example.json"
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
Assert-Test -Condition ($config.environment -eq "homologation") -Message "Example config environment is not homologation."
Assert-Test -Condition ($config.repositoryRoot -eq $script:HmlExpectedRoot) -Message "Example config repository root does not match the fixed path."
Assert-Test -Condition ($config.productionBackupRoots.Count -gt 0) -Message "Example config has no backup allowlist."

$refreshSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot "refresh.ps1") -Raw
Assert-Test -Condition ($refreshSource.Contains('.env.backup')) -Message "Refresh does not explicitly exclude .env.backup."
Assert-Test -Condition ($refreshSource.Contains('Get-FileHash')) -Message "Refresh does not validate backup SHA-256."
Assert-Test -Condition ($refreshSource.Contains('frota_hml_refresh_')) -Message "Refresh does not restore into a temporary database."

$startSource = Get-Content -LiteralPath (Join-Path $PSScriptRoot "start.ps1") -Raw
Assert-Test -Condition (-not $startSource.Contains('0.0.0.0')) -Message "Start script must never bind homologation to all interfaces."
Assert-Test -Condition (-not $startSource.Contains('--reload')) -Message "Start script must keep a directly verifiable backend PID."

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    throw "$($failures.Count) homologation script test(s) failed."
}
Write-Host "All homologation infrastructure tests passed." -ForegroundColor Green
