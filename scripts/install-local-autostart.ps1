[CmdletBinding()]
param([switch]$SystemAccount = $true)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logRoot = Join-Path $root 'storage\logs'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
Start-Transcript -Path (Join-Path $logRoot 'install-local-autostart.log') -Append
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdministrator = (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($SystemAccount -and -not $isAdministrator) {
        throw 'Para iniciar antes do login, execute este instalador como administrador.'
    }
    $powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $watchdogAction = New-ScheduledTaskAction -Execute $powerShell -WorkingDirectory $root -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}\scripts\run-local-watchdog.ps1"' -f $root)
    $backupAction = New-ScheduledTaskAction -Execute $powerShell -WorkingDirectory $root -Argument ('-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}\scripts\run-local-backup-automatico.ps1"' -f $root)
    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    if ($SystemAccount) {
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        $boot = New-ScheduledTaskTrigger -AtStartup
        $boot.Delay = 'PT30S'
    } else {
        $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
        $boot = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
    }
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName 'FROTA Watchdog Local' -Action $watchdogAction -Trigger @($boot,$repeat) -Principal $principal -Settings $settings -Description "Frotas: operacao e recuperacao em $root; sem sincronizacao da instalacao antiga." -Force -ErrorAction Stop | Out-Null
    $backupTriggers = @(0,12,19 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.AddHours($_)) })
    $backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName 'FROTA Backup Local' -Action $backupAction -Trigger $backupTriggers -Principal $principal -Settings $backupSettings -Description "Backup de banco e anexos do Frotas em $root." -Force -ErrorAction Stop | Out-Null
    if ($SystemAccount) {
        foreach ($serviceName in @('postgresql-x64-16','Cloudflared')) {
            Set-Service -Name $serviceName -StartupType Automatic
            & sc.exe failure $serviceName reset= 86400 actions= 'restart/20000/restart/60000/restart/120000'
            if ($LASTEXITCODE -ne 0) { throw "Falha ao configurar recuperacao de $serviceName" }
            & sc.exe failureflag $serviceName 1
            if ($LASTEXITCODE -ne 0) { throw "Falha ao configurar failureflag de $serviceName" }
        }
    }
    Start-ScheduledTask -TaskName 'FROTA Watchdog Local'
    Write-Host "Retomada e backup configurados em $root. SYSTEM=$SystemAccount"
} finally {
    Stop-Transcript
}
