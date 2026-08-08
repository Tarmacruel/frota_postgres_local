[CmdletBinding()]
param(
    [string]$TaskName = "FROTA Docker Backup Mirror",
    [string]$RepoRoot = "\\SAD61SVR001\licitacao.1\FROTAS\frota_postgres_local",
    [string]$MirrorRoot = "C:\Users\078364\OneDrive\BACKUPS\FROTAS",
    [ValidateRange(1, 100)][int]$RetentionCount = 10,
    [string]$TaskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    [securestring]$TaskPassword
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptPath = Join-Path $RepoRoot "deploy\windows\Sync-FrotaDockerBackups.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Script de espelhamento nao encontrado: $scriptPath"
}

if ($null -eq $TaskPassword) {
    $TaskPassword = Read-Host "Senha para a tarefa $TaskUser" -AsSecureString
}

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TaskPassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "Senha vazia; tarefa nao criada."
    }

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy Bypass",
        "-File `"$scriptPath`"",
        "-MirrorRoot `"$MirrorRoot`"",
        "-RetentionCount $RetentionCount"
    ) -join " "
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $today = [datetime]::Today
    $triggers = foreach ($hour in @(0, 12, 19)) {
        New-ScheduledTaskTrigger -Daily -At ($today.AddHours($hour).AddMinutes(15))
    }
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $triggers `
        -Settings $settings `
        -User $TaskUser `
        -Password $plainPassword `
        -RunLevel Limited `
        -Description "Espelha backups Docker do Frota em Z: para OneDrive, com verificacao SHA-256." `
        -Force | Out-Null
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $plainPassword = $null
}

Write-Host "Tarefa '$TaskName' criada/atualizada." -ForegroundColor Green
