[CmdletBinding()]
param(
    [ValidateSet(
        "Menu",
        "StartStack",
        "Start",
        "Backend",
        "Frontend",
        "Postgres",
        "Publish",
        "Stop",
        "Status",
        "Logs",
        "Backup",
        "BackupAuto",
        "WatchdogInstall",
        "WatchdogRun",
        "Migrate",
        "Update"
    )]
    [string]$Action = "Menu",
    [int]$Port = 8000,
    [int]$FrontendPort = 3000,
    [switch]$InstallDeps,
    [switch]$SkipGitPull,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$opsRoot = $PSScriptRoot
$repoRoot = Convert-Path (Join-Path $opsRoot "..\..")

. (Join-Path $opsRoot "common.ps1")

Initialize-FrotaStorage
$paths = Get-FrotaPaths

function Get-CurrentIpAddress {
    $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" } |
        Select-Object -First 1).IPAddress

    if (-not $ipAddress) {
        return "localhost"
    }

    return $ipAddress
}

function Start-FrotaProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [Parameter(Mandatory = $true)][string]$ErrFile,
        [Parameter(Mandatory = $true)][string]$PidFile
    )

    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        throw "Script nao encontrado: $ScriptPath"
    }

    $argumentList = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$ScriptPath`""
    ) + $Arguments

    $process = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $argumentList `
        -WorkingDirectory $paths.Root `
        -RedirectStandardOutput $OutFile `
        -RedirectStandardError $ErrFile `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -LiteralPath $PidFile -Value "$($process.Id)" -Encoding ASCII
    Write-Host "$Title iniciado. PID: $($process.Id)" -ForegroundColor Green
    return $process
}

function Wait-PortReady {
    param(
        [Parameter(Mandatory = $true)][int]$TargetPort,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $ownerPid = Get-PortOwnerPid -Port $TargetPort
        if ($ownerPid) {
            return $true
        }
        Start-Sleep -Seconds 2
    }

    return $false
}

function Invoke-Migrations {
    $alembic = Join-Path $paths.BackendRoot ".venv\Scripts\alembic.exe"
    if (-not (Test-Path -LiteralPath $alembic)) {
        throw "Alembic nao encontrado em '$alembic'. Execute a preparacao do ambiente primeiro."
    }

    Push-Location $paths.BackendRoot
    try {
        Write-Host "Aplicando migrations..." -ForegroundColor Cyan
        Invoke-CheckedCommand -Label "Alembic upgrade head" -Command { & $alembic upgrade head }
        Write-Host "Migrations aplicadas." -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

function Invoke-Seed {
    $python = Join-Path $paths.BackendRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $python)) {
        throw "Python venv nao encontrado em '$python'."
    }

    Push-Location $paths.BackendRoot
    try {
        Write-Host "Carregando dados iniciais..." -ForegroundColor Cyan
        Invoke-CheckedCommand -Label "Seed" -Command { & $python -m scripts.seed }
        Write-Host "Seed concluido." -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

function Invoke-FrontendBuild {
    Push-Location $paths.FrontendRoot
    try {
        if (-not (Test-Path -LiteralPath "node_modules")) {
            Write-Host "Instalando dependencias do frontend..." -ForegroundColor Cyan
            Invoke-CheckedCommand -Label "npm install" -Command { npm install }
        }

        Write-Host "Buildando frontend..." -ForegroundColor Cyan
        Invoke-CheckedCommand -Label "npm run build" -Command { npm run build }
    }
    finally {
        Pop-Location
    }
}

function Invoke-PostgresSetup {
    if (-not (Test-Path -LiteralPath $paths.PostgresScript)) {
        throw "Bootstrap de PostgreSQL local nao encontrado: $($paths.PostgresScript)"
    }

    Write-Host "Preparando PostgreSQL local..." -ForegroundColor Cyan
    Invoke-CheckedCommand -Label "PostgreSQL local" -Command {
        & $paths.PostgresScript `
            -PgHost "localhost" `
            -Port 5432 `
            -Database "frota_db" `
            -DbUser "frota_user" `
            -DbPassword "frota_secret" `
            -SuperUser "frota_user"
    }

    Invoke-Migrations
    Invoke-Seed
}

function Stop-FrotaEnvironment {
    $stopped = $false
    $pidFiles = @($paths.AppPidFile, $paths.FrontendPidFile)

    foreach ($pidFile in $pidFiles) {
        $processId = Get-ProcessIdFromFile -Path $pidFile
        if ($processId -and (Test-ProcessAlive -ProcessId $processId)) {
            Write-Host "Encerrando PID registrado: $processId" -ForegroundColor Yellow
            Stop-ProcessTreeSafe -ProcessId $processId
            $stopped = $true
        }
        Remove-IfExists -Path $pidFile
    }

    foreach ($targetPort in @($Port, $FrontendPort)) {
        $ownerPid = Get-PortOwnerPid -Port $targetPort
        if ($ownerPid -and (Test-ProcessAlive -ProcessId $ownerPid)) {
            Write-Host "Encerrando processo na porta ${targetPort}: PID $ownerPid" -ForegroundColor Yellow
            Stop-ProcessTreeSafe -ProcessId $ownerPid
            $stopped = $true
        }
    }

    Remove-IfExists -Path $paths.SessionFile

    if ($stopped) {
        Write-Host "Ambiente Frota parado." -ForegroundColor Green
    }
    else {
        Write-Host "Nenhum processo ativo foi encontrado." -ForegroundColor Yellow
    }
}

function Show-Status {
    $session = Read-FrotaSession
    $backendPid = Get-ProcessIdFromFile -Path $paths.AppPidFile
    $frontendPid = Get-ProcessIdFromFile -Path $paths.FrontendPidFile
    $backendOwner = Get-PortOwnerPid -Port $Port
    $frontendOwner = Get-PortOwnerPid -Port $FrontendPort
    $publishOwner = Get-PortOwnerPid -Port 80
    $ipAddress = Get-CurrentIpAddress

    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host " FROTA - Status Operacional" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "Repositorio        : $($paths.Root)"
    Write-Host "Backend PID file   : $backendPid"
    Write-Host "Frontend PID file  : $frontendPid"
    Write-Host "Porta backend $Port : $backendOwner"
    Write-Host "Porta frontend $FrontendPort : $frontendOwner"
    Write-Host "Porta publicacao 80: $publishOwner"
    Write-Host "URL backend        : http://localhost:$Port"
    Write-Host "URL frontend       : http://localhost:$FrontendPort"
    Write-Host "URL rede frontend  : http://${ipAddress}:$FrontendPort"
    Write-Host "Logs               : $($paths.LogsRoot)"

    if ($session) {
        Write-Host "Sessao iniciada em : $($session.startedAt)"
        Write-Host "Modo producao      : $($session.production)"
    }
}

function Open-Logs {
    Initialize-FrotaStorage
    Start-Process explorer.exe $paths.LogsRoot | Out-Null
    Write-Host "Pasta de logs aberta: $($paths.LogsRoot)" -ForegroundColor Green
}

function Start-Backend {
    param(
        [int]$TargetPort = $Port,
        [switch]$Production
    )

    $existing = Get-PortOwnerPid -Port $TargetPort
    if ($existing) {
        throw "A porta $TargetPort ja esta em uso pelo PID $existing."
    }

    $backendScript = if ($Production) { $paths.BackendProductionScript } else { $paths.BackendDevScript }
    $process = Start-FrotaProcess `
        -Title "Backend" `
        -ScriptPath $backendScript `
        -Arguments @("-Port", "$TargetPort") `
        -OutFile $paths.AppLogFile `
        -ErrFile $paths.AppErrLogFile `
        -PidFile $paths.AppPidFile

    if (-not (Wait-PortReady -TargetPort $TargetPort -TimeoutSeconds 90)) {
        throw "Backend iniciou com PID $($process.Id), mas a porta $TargetPort nao respondeu. Verifique os logs."
    }

    Write-FrotaSession -ProcessId $process.Id -Port $TargetPort -Production $Production.IsPresent
    Write-Host "Backend: http://localhost:$TargetPort" -ForegroundColor Cyan
}

function Start-Frontend {
    param([switch]$Production)

    $existing = Get-PortOwnerPid -Port $FrontendPort
    if ($existing) {
        throw "A porta $FrontendPort ja esta em uso pelo PID $existing."
    }

    $frontendScript = if ($Production) { $paths.FrontendProductionScript } else { $paths.FrontendDevScript }
    $process = Start-FrotaProcess `
        -Title "Frontend" `
        -ScriptPath $frontendScript `
        -Arguments @("-Port", "$FrontendPort") `
        -OutFile $paths.FrontendLogFile `
        -ErrFile $paths.FrontendErrLogFile `
        -PidFile $paths.FrontendPidFile

    if (-not (Wait-PortReady -TargetPort $FrontendPort -TimeoutSeconds 90)) {
        throw "Frontend iniciou com PID $($process.Id), mas a porta $FrontendPort nao respondeu. Verifique os logs."
    }

    Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Cyan
}

function Start-Stack {
    Start-Backend -TargetPort $Port
    Start-Frontend

    $backendPid = Get-ProcessIdFromFile -Path $paths.AppPidFile
    $frontendPid = Get-ProcessIdFromFile -Path $paths.FrontendPidFile
    Write-FrotaSession -ProcessId $backendPid -FrontendProcessId $frontendPid -Port $Port -FrontendPort $FrontendPort -Production $false
}

function Invoke-Action {
    param([Parameter(Mandatory = $true)][string]$SelectedAction)

    switch ($SelectedAction) {
        "Start" { Start-Stack }
        "StartStack" { Start-Stack }
        "Backend" { Start-Backend -TargetPort $Port }
        "Frontend" { Start-Frontend }
        "Postgres" { Invoke-PostgresSetup }
        "Publish" {
            Invoke-Migrations
            Invoke-FrontendBuild
            Stop-FrotaEnvironment
            Start-Backend -TargetPort $Port -Production
            Start-Frontend -Production
        }
        "Stop" { Stop-FrotaEnvironment }
        "Status" { Show-Status }
        "Logs" { Open-Logs }
        "Backup" { & $paths.BackupAutoScript }
        "BackupAuto" { & $paths.BackupAutoInstallScript }
        "WatchdogInstall" { & $paths.WatchdogInstallScript }
        "WatchdogRun" { & $paths.WatchdogScript }
        "Migrate" { Invoke-Migrations }
        "Update" {
            Set-Location $paths.Root
            if (-not $SkipGitPull) {
                Write-Host "Atualizando repositorio..." -ForegroundColor Cyan
                Invoke-CheckedCommand -Label "git pull" -Command { git pull --ff-only }
            }
            if ($InstallDeps) {
                Push-Location $paths.BackendRoot
                try {
                    $python = Join-Path $paths.BackendRoot ".venv\Scripts\python.exe"
                    Invoke-CheckedCommand -Label "pip install" -Command { & $python -m pip install -r requirements.txt }
                }
                finally {
                    Pop-Location
                }
            }
            Invoke-Migrations
            Invoke-FrontendBuild
            Write-Host "Atualizacao concluida." -ForegroundColor Green
        }
        default { throw "Acao nao suportada: $SelectedAction" }
    }
}

function Show-Menu {
    Clear-Host
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "        FROTA - Central Operacional        " -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "[1] Iniciar stack dev (backend + frontend)"
    Write-Host "[2] Iniciar backend"
    Write-Host "[3] Iniciar frontend"
    Write-Host "[4] Preparar PostgreSQL local"
    Write-Host "[5] Publicar na porta 80"
    Write-Host "[6] Parar ambiente"
    Write-Host "[7] Status"
    Write-Host "[8] Abrir logs"
    Write-Host "[9] Backup manual"
    Write-Host "[10] Configurar backup automatico"
    Write-Host "[11] Configurar auto-retomada"
    Write-Host "[12] Executar watchdog agora"
    Write-Host "[13] Aplicar migrations"
    Write-Host "[14] Atualizar projeto"
    Write-Host "[0] Sair"
    Write-Host ""

    $option = Read-Host "Escolha uma opcao"
    $selectedAction = switch ($option) {
        "1" { "StartStack" }
        "2" { "Backend" }
        "3" { "Frontend" }
        "4" { "Postgres" }
        "5" { "Publish" }
        "6" { "Stop" }
        "7" { "Status" }
        "8" { "Logs" }
        "9" { "Backup" }
        "10" { "BackupAuto" }
        "11" { "WatchdogInstall" }
        "12" { "WatchdogRun" }
        "13" { "Migrate" }
        "14" { "Update" }
        "0" { $null }
        default { "Invalid" }
    }

    if ($selectedAction -eq "Invalid") {
        Write-Host "Opcao invalida." -ForegroundColor Red
        return $true
    }

    if (-not $selectedAction) {
        Write-Host "Fechando central operacional." -ForegroundColor Yellow
        return $false
    }

    Invoke-Action -SelectedAction $selectedAction
    return $true
}

if ($Action -eq "Menu") {
    $keepRunning = Show-Menu
    if ($keepRunning -and -not $NoPause) {
        Write-Host ""
        Read-Host "Pressione Enter para fechar"
    }
    exit 0
}

Invoke-Action -SelectedAction $Action

if (-not $NoPause) {
    Write-Host ""
    Read-Host "Concluido. Pressione Enter para fechar"
}
