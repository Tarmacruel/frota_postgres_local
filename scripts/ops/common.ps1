Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-FrotaPaths {
    $root = Convert-Path (Join-Path $PSScriptRoot "..\..")

    $paths = [ordered]@{
        Root                    = $root
        ScriptsRoot             = Join-Path $root "scripts"
        OpsRoot                 = Join-Path $root "scripts\ops"
        BackendRoot             = Join-Path $root "backend"
        FrontendRoot            = Join-Path $root "frontend"
        RuntimeRoot             = Join-Path $root "storage\runtime"
        LogsRoot                = Join-Path $root "storage\logs"
        BackupsRoot             = Join-Path $root "storage\backups"
        BackendDevScript        = Join-Path $root "scripts\run-dev-server.ps1"
        FrontendDevScript       = Join-Path $root "scripts\run-frontend-dev.ps1"
        PostgresScript          = Join-Path $root "scripts\start_local_postgres.ps1"
        BackupScript            = Join-Path $root "scripts\backup-local.ps1"
        BackupAutoScript        = Join-Path $root "scripts\run-backup-automatico.ps1"
        BackupAutoInstallScript = Join-Path $root "scripts\install-backup-automatico.ps1"
        RemoteSetupScript       = Join-Path $root "scripts\setup-remote-backend.ps1"
        AppPidFile              = Join-Path $root "storage\runtime\frota-app.pid"
        FrontendPidFile         = Join-Path $root "storage\runtime\frota-frontend.pid"
        SessionFile             = Join-Path $root "storage\runtime\frota-session.json"
        AppLogFile              = Join-Path $root "storage\logs\frota-app.log"
        AppErrLogFile           = Join-Path $root "storage\logs\frota-app.error.log"
        FrontendLogFile         = Join-Path $root "storage\logs\frota-frontend.log"
        FrontendErrLogFile      = Join-Path $root "storage\logs\frota-frontend.error.log"
    }

    return [pscustomobject]$paths
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Initialize-FrotaStorage {
    $paths = Get-FrotaPaths
    Ensure-Directory -Path $paths.RuntimeRoot
    Ensure-Directory -Path $paths.LogsRoot
    Ensure-Directory -Path $paths.BackupsRoot
}

function Remove-IfExists {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function Get-ProcessIdFromFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = (Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue).Trim()
    if (-not $raw) {
        return $null
    }

    $pidValue = 0
    if ([int]::TryParse($raw, [ref]$pidValue)) {
        return $pidValue
    }

    return $null
}

function Test-ProcessAlive {
    param([int]$ProcessId)

    if (-not $ProcessId) {
        return $false
    }

    try {
        $null = Get-Process -Id $ProcessId -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Get-PortOwnerPid {
    param([Parameter(Mandatory = $true)][int]$Port)

    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -First 1
        if ($connection) {
            return $connection.OwningProcess
        }
    }
    catch {
    }

    return $null
}

function Stop-ProcessTreeSafe {
    param([int]$ProcessId)

    if (-not $ProcessId) {
        return
    }

    $taskkill = Get-Command taskkill.exe -ErrorAction SilentlyContinue
    if ($taskkill) {
        try {
            & $taskkill.Path /PID $ProcessId /T /F | Out-Null
            return
        }
        catch {
        }
    }

    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    }
    catch {
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label falhou com codigo $LASTEXITCODE."
    }
}

function Write-FrotaSession {
    param(
        [int]$ProcessId,
        [int]$FrontendProcessId = 0,
        [int]$Port,
        [int]$FrontendPort = 0,
        [bool]$Production
    )

    $paths = Get-FrotaPaths
    $payload = [ordered]@{
        startedAt   = (Get-Date).ToString("s")
        pid         = $ProcessId
        frontendPid = $FrontendProcessId
        port        = $Port
        frontendPort = $FrontendPort
        production  = $Production
        machine     = $env:COMPUTERNAME
        user        = $env:USERNAME
    } | ConvertTo-Json -Depth 4

    Set-Content -LiteralPath $paths.SessionFile -Value $payload -Encoding UTF8
    if ($ProcessId) {
        Set-Content -LiteralPath $paths.AppPidFile -Value "$ProcessId" -Encoding ASCII
    }
    if ($FrontendProcessId) {
        Set-Content -LiteralPath $paths.FrontendPidFile -Value "$FrontendProcessId" -Encoding ASCII
    }
}

function Read-FrotaSession {
    $paths = Get-FrotaPaths

    if (-not (Test-Path -LiteralPath $paths.SessionFile)) {
        return $null
    }

    try {
        return (Get-Content -LiteralPath $paths.SessionFile -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}
