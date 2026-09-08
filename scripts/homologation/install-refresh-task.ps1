[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Assert-HmlRepository
Assert-HmlAdministrator
foreach ($command in @("New-ScheduledTaskAction", "Register-ScheduledTask")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "ScheduledTasks module is unavailable." }
}
if (-not (Test-Path -LiteralPath $script:HmlExpectedVhdx -PathType Leaf)) { throw "Secure homologation VHDX has not been provisioned." }
$dpapiPath = Join-Path $env:LOCALAPPDATA "FrotaPMTF\Homologation\frota-hml-unlock.dpapi"
if (-not (Test-Path -LiteralPath $dpapiPath -PathType Leaf)) { throw "Current user has no DPAPI-protected VHDX unlock material." }

$taskPath = "\FrotaPMTF\"
$mountTaskName = "Frota-HML-Mount"
$refreshTaskName = "Frota-HML-Refresh"
$mountScript = Join-Path $PSScriptRoot "mount.ps1"
$refreshScript = Join-Path $PSScriptRoot "scheduled-refresh.ps1"
$powerShell = Join-Path $PSHOME "powershell.exe"
if (-not (Test-Path -LiteralPath $powerShell)) { $powerShell = (Get-Command powershell.exe).Source }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)

$mountAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$mountScript`""
$mountTrigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$mountTask = New-ScheduledTask -Action $mountAction -Trigger $mountTrigger -Principal $principal -Settings $settings -Description "Mount and unlock the encrypted Frota homologation VHDX for the authorized Windows user."

$refreshAction = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$refreshScript`""
$refreshTrigger = New-ScheduledTaskTrigger -Daily -At "03:30"
$refreshTask = New-ScheduledTask -Action $refreshAction -Trigger $refreshTrigger -Principal $principal -Settings $settings -Description "Refresh Frota homologation from the newest allowlisted, checksum-validated production backup."

if ($PSCmdlet.ShouldProcess("$taskPath", "Ensure Task Scheduler folder exists")) {
    $scheduler = New-Object -ComObject "Schedule.Service"
    $scheduler.Connect()
    $rootFolder = $scheduler.GetFolder("\")
    try { [void]$scheduler.GetFolder($taskPath.TrimEnd('\')) }
    catch { [void]$rootFolder.CreateFolder("FrotaPMTF") }
}
if ($PSCmdlet.ShouldProcess("$taskPath$mountTaskName", "Register logon mount task")) {
    Register-ScheduledTask -TaskPath $taskPath -TaskName $mountTaskName -InputObject $mountTask -Force | Out-Null
}
if ($PSCmdlet.ShouldProcess("$taskPath$refreshTaskName", "Register daily 03:30 refresh task")) {
    Register-ScheduledTask -TaskPath $taskPath -TaskName $refreshTaskName -InputObject $refreshTask -Force | Out-Null
}

Write-Host "Scheduled tasks installed for '$($identity.Name)':" -ForegroundColor Green
Write-Host "  $taskPath$mountTaskName (at logon)"
Write-Host "  $taskPath$refreshTaskName (daily at 03:30)"
