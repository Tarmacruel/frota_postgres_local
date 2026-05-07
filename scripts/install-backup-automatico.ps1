[CmdletBinding()]
param(
    [string]$TaskName = "FROTA Backup Automatico",
    [string]$RepoRoot = "\\sad61svr001\licitacao.1\FROTAS\frota_postgres_local",
    [string]$MirrorRoot = "C:\Users\078364\OneDrive\BACKUPS\FROTAS",
    [int]$RetentionCount = 10,
    [string]$TaskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    [securestring]$TaskPassword
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory = $true)][securestring]$SecureString)

    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "Repositorio nao encontrado em '$RepoRoot'. Confirme o caminho UNC antes de instalar a tarefa."
}

$runnerScript = Join-Path $RepoRoot "scripts\run-backup-automatico.ps1"
if (-not (Test-Path -LiteralPath $runnerScript)) {
    throw "Script de backup automatico nao encontrado em '$runnerScript'."
}

Ensure-Directory -Path $MirrorRoot

if ($null -eq $TaskPassword) {
    Write-Host "A tarefa sera criada para rodar mesmo sem login." -ForegroundColor Yellow
    Write-Host "Digite a senha do usuario $TaskUser para registrar a tarefa no Windows." -ForegroundColor Yellow
    $TaskPassword = Read-Host "Senha" -AsSecureString
}

$plainPassword = Convert-SecureStringToPlainText -SecureString $TaskPassword
if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    throw "Senha vazia. A tarefa nao foi criada."
}

$arguments = @(
    "-NoProfile",
    "-ExecutionPolicy Bypass",
    "-File `"$runnerScript`"",
    "-BackupRoot `"storage\backups`"",
    "-MirrorRoot `"$MirrorRoot`"",
    "-RetentionCount $RetentionCount"
) -join " "

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$today = [datetime]::Today
$triggers = foreach ($hour in @(0, 12, 19)) {
    New-ScheduledTaskTrigger -Daily -At ($today.AddHours($hour))
}
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$description = "Rotina automatica de backup do FROTAS com execucao as 00:00, 12:00 e 19:00, retencao de $RetentionCount copias e espelhamento em OneDrive."

try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $triggers `
        -Settings $settings `
        -User $TaskUser `
        -Password $plainPassword `
        -RunLevel Limited `
        -Description $description `
        -Force | Out-Null
}
finally {
    $plainPassword = $null
}

Write-Host "Tarefa agendada criada/atualizada com sucesso." -ForegroundColor Green
Write-Host "Nome: $TaskName"
Write-Host "Usuario: $TaskUser"
Write-Host "Repositorio: $RepoRoot"
Write-Host "Espelho: $MirrorRoot"
Write-Host "Horarios: 00:00, 12:00, 19:00"
Write-Host ""
Write-Host "Para conferir:" -ForegroundColor Cyan
Write-Host "schtasks /Query /TN `"$TaskName`" /FO LIST /V"
