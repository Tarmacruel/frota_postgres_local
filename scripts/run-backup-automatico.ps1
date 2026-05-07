[CmdletBinding()]
param(
    [string]$BackupRoot = "storage\backups",
    [string]$MirrorRoot = "C:\Users\078364\OneDrive\BACKUPS\FROTAS",
    [int]$RetentionCount = 10
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$backupScript = Join-Path $PSScriptRoot "backup-local.ps1"
$logRoot = Join-Path $repoRoot "storage\logs"
$logPath = Join-Path $logRoot "frota-backup-automatico.log"

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-BackupLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Level = "INFO"
    )

    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

Ensure-Directory -Path $logRoot

try {
    Set-Location -Path $repoRoot
    Write-BackupLog -Message "Iniciando backup automatico."

    & $backupScript `
        -BackupRoot $BackupRoot `
        -MirrorRoot $MirrorRoot `
        -RetentionCount $RetentionCount

    Write-BackupLog -Message "Backup automatico concluido com sucesso."
}
catch {
    Write-BackupLog -Message $_.Exception.Message -Level "ERROR"
    throw
}
