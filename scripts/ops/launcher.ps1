[CmdletBinding()]
param(
    [ValidateSet("Menu", "StartLocal", "Stop", "Reset", "Status", "Logs", "Backup")]
    [string]$Action = "Menu"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$centralScript = Join-Path $PSScriptRoot "frota.ps1"
$mappedAction = switch ($Action) {
    "StartLocal" { "Start" }
    default { $Action }
}

& $centralScript -Action $mappedAction
