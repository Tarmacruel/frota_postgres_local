[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$runtimeRoot = Convert-Path (Join-Path $PSScriptRoot "..")
$runner = Join-Path $PSScriptRoot "run-backup-automatico.ps1"

& $runner `
    -BackupRoot (Join-Path $runtimeRoot "storage\backups") `
    -MirrorRoot "C:\Users\078364\OneDrive\BACKUPS\FROTAS" `
    -StorageRoot (Join-Path $runtimeRoot "data\uploads") `
    -RetentionCount 10

# backup-local.ps1 usa robocopy, cujo codigo 1 tambem indica sucesso. As falhas
# reais sao lancadas como excecao pelo runner; portanto, ao chegar aqui a tarefa
# deve terminar com sucesso, sem herdar esse codigo residual do robocopy.
exit 0
