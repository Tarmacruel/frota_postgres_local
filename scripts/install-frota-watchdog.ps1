[CmdletBinding()]
param(
    [string]$TaskName = "FROTA Watchdog",
    [string]$LegacyTaskName = "FrotaPMTF",
    [string]$SourceRoot = "\\Sad61svr001\licitacao.1\FROTAS\frota_postgres_local",
    [string]$RuntimeRoot = "C:\FROTAS\frota_runtime",
    [string]$DataRoot = "",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000,
    [string]$PostgresServiceName = "postgresql-x64-16",
    [string]$CloudflaredServiceName = "Cloudflared",
    [string]$TaskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    [securestring]$TaskPassword,
    [switch]$SkipDependencyInstall,
    [switch]$SkipTaskRegistration,
    [switch]$SkipLegacyTaskDisable,
    [switch]$RunOnceAfterInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot = Join-Path $RuntimeRoot "data\uploads"
}
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)

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

function Invoke-RobocopyChecked {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string[]]$ExtraArgs = @()
    )

    $robocopy = Get-Command robocopy.exe -ErrorAction SilentlyContinue
    if (-not $robocopy) {
        throw "robocopy.exe nao encontrado."
    }

    Ensure-Directory -Path $Destination
    & $robocopy.Source $Source $Destination @ExtraArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ge 8) {
        throw "Robocopy falhou de '$Source' para '$Destination' com codigo $exitCode."
    }

    return $exitCode
}

function Sync-RepositoryToRuntime {
    if (-not (Test-Path -LiteralPath $SourceRoot)) {
        throw "Fonte de rede nao encontrada: $SourceRoot"
    }

    $sourceFull = [System.IO.Path]::GetFullPath($SourceRoot)
    if ($sourceFull.TrimEnd("\") -ieq $RuntimeRoot.TrimEnd("\")) {
        throw "SourceRoot e RuntimeRoot nao podem ser o mesmo caminho."
    }

    $excludeDirs = @(
        ".git",
        "data",
        "runtime",
        "logs",
        "backups",
        ".venv",
        "node_modules",
        (Join-Path $sourceFull ".git"),
        (Join-Path $sourceFull "storage\runtime"),
        (Join-Path $sourceFull "storage\logs"),
        (Join-Path $sourceFull "storage\backups"),
        (Join-Path $sourceFull "backend\.venv"),
        (Join-Path $sourceFull "frontend\node_modules"),
        (Join-Path $sourceFull "data"),
        (Join-Path $RuntimeRoot ".git"),
        (Join-Path $RuntimeRoot "storage\runtime"),
        (Join-Path $RuntimeRoot "storage\logs"),
        (Join-Path $RuntimeRoot "storage\backups"),
        (Join-Path $RuntimeRoot "backend\.venv"),
        (Join-Path $RuntimeRoot "frontend\node_modules"),
        (Join-Path $RuntimeRoot "data")
    )

    $args = @("/MIR", "/R:2", "/W:2", "/XJ", "/NP", "/XD") + $excludeDirs
    Write-Host "Sincronizando runtime local..." -ForegroundColor Cyan
    $exitCode = Invoke-RobocopyChecked -Source $sourceFull -Destination $RuntimeRoot -ExtraArgs $args
    Write-Host "Robocopy concluido com codigo $exitCode." -ForegroundColor Green
}

function Update-EnvFileValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $lines = @()
    if (Test-Path -LiteralPath $Path) {
        $lines = Get-Content -LiteralPath $Path
    }

    $found = $false
    $escapedName = [regex]::Escape($Name)
    $updated = foreach ($line in $lines) {
        if ($line -match "^$escapedName=") {
            $found = $true
            "$Name=$Value"
        }
        else {
            $line
        }
    }

    if (-not $found) {
        $updated += "$Name=$Value"
    }

    Set-Content -LiteralPath $Path -Value $updated -Encoding UTF8
}

function Ensure-RuntimeEnv {
    $backendRoot = Join-Path $RuntimeRoot "backend"
    $envFile = Join-Path $backendRoot ".env"
    $envExample = Join-Path $backendRoot ".env.example"

    if (-not (Test-Path -LiteralPath $envFile)) {
        if (Test-Path -LiteralPath $envExample) {
            Copy-Item -LiteralPath $envExample -Destination $envFile -Force
        }
        else {
            @(
                "DATABASE_URL=postgresql+asyncpg://frota_user:frota_secret@127.0.0.1:5432/frota_db",
                "SECRET_KEY=supersecretkeychangeinproduction",
                "ALGORITHM=HS256",
                "ACCESS_TOKEN_EXPIRE_MINUTES=60",
                'CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://localhost:8000","http://127.0.0.1:8000","https://frota.sirel.com.br","http://frota.sirel.com.br"]',
                "COOKIE_NAME=access_token",
                "COOKIE_SECURE=false",
                "APP_ENV=development"
            ) | Set-Content -LiteralPath $envFile -Encoding UTF8
        }
    }

    Ensure-Directory -Path $DataRoot
    Update-EnvFileValue -Path $envFile -Name "STORAGE_DIR" -Value $DataRoot
    Write-Host "STORAGE_DIR configurado em $DataRoot" -ForegroundColor Green
}

function Migrate-LegacyStorage {
    $legacyStorage = Join-Path $RuntimeRoot "backend\storage"
    if (-not (Test-Path -LiteralPath $legacyStorage)) {
        return
    }

    Write-Host "Migrando anexos legados para STORAGE_DIR..." -ForegroundColor Cyan
    $args = @("/E", "/R:2", "/W:2", "/XJ", "/NP")
    $exitCode = Invoke-RobocopyChecked -Source $legacyStorage -Destination $DataRoot -ExtraArgs $args
    Write-Host "Migracao de anexos concluida com codigo $exitCode." -ForegroundColor Green
}

function Install-BackendDependencies {
    $backendRoot = Join-Path $RuntimeRoot "backend"
    $pythonExe = Join-Path $backendRoot ".venv\Scripts\python.exe"
    $requirements = Join-Path $backendRoot "requirements.txt"

    if (Test-Path -LiteralPath $pythonExe) {
        Write-Host "backend\.venv local ja existe." -ForegroundColor Green
        return
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $python) {
        $python = Get-Command python -ErrorAction SilentlyContinue
    }
    if (-not $python) {
        throw "Python nao encontrado para criar backend\.venv."
    }

    Write-Host "Criando backend\.venv local..." -ForegroundColor Cyan
    & $python.Source -m venv (Join-Path $backendRoot ".venv")
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar backend\.venv."
    }

    & $pythonExe -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao atualizar pip."
    }

    & $pythonExe -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao instalar dependencias Python."
    }
}

function Install-FrontendDependencies {
    $frontendRoot = Join-Path $RuntimeRoot "frontend"
    $viteCmd = Join-Path $frontendRoot "node_modules\.bin\vite.cmd"

    if (Test-Path -LiteralPath $viteCmd) {
        Write-Host "frontend\node_modules local ja existe." -ForegroundColor Green
        return
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
        throw "npm nao encontrado para instalar frontend\node_modules."
    }

    Write-Host "Instalando frontend\node_modules local..." -ForegroundColor Cyan
    Push-Location $frontendRoot
    try {
        & $npm.Source install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install falhou."
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-RuntimeMigrations {
    $backendRoot = Join-Path $RuntimeRoot "backend"
    $alembic = Join-Path $backendRoot ".venv\Scripts\alembic.exe"
    if (-not (Test-Path -LiteralPath $alembic)) {
        throw "Alembic nao encontrado em $alembic"
    }

    Write-Host "Aplicando migrations no runtime local..." -ForegroundColor Cyan
    Push-Location $backendRoot
    try {
        & $alembic upgrade heads
        if ($LASTEXITCODE -ne 0) {
            throw "alembic upgrade heads falhou."
        }
    }
    finally {
        Pop-Location
    }
}

function Configure-ServiceRecovery {
    param([Parameter(Mandatory = $true)][string]$ServiceName)

    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Host "Servico '$ServiceName' nao encontrado; recuperacao nao configurada." -ForegroundColor Yellow
        return
    }

    Write-Host "Configurando recuperacao do servico $ServiceName..." -ForegroundColor Cyan
    & sc.exe failure $ServiceName reset= 86400 actions= "restart/20000/restart/60000/restart/120000" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao configurar recuperacao do servico $ServiceName."
    }

    & sc.exe failureflag $ServiceName 1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao habilitar failureflag do servico $ServiceName."
    }
}

function Disable-LegacyTask {
    if ($SkipLegacyTaskDisable) {
        return
    }

    & schtasks.exe /Query /TN $LegacyTaskName | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return
    }

    Write-Host "Desativando tarefa antiga $LegacyTaskName..." -ForegroundColor Yellow
    & schtasks.exe /Change /TN $LegacyTaskName /DISABLE | Out-Null
}

function Register-WatchdogTask {
    if ($SkipTaskRegistration) {
        Write-Host "Registro da tarefa ignorado por parametro." -ForegroundColor Yellow
        return
    }

    $watchdogScript = Join-Path $RuntimeRoot "scripts\frota-watchdog.ps1"
    if (-not (Test-Path -LiteralPath $watchdogScript)) {
        throw "Watchdog nao encontrado no runtime local: $watchdogScript"
    }

    if ($null -eq $TaskPassword) {
        Write-Host "Digite a senha do usuario $TaskUser para registrar a tarefa com acesso a rede." -ForegroundColor Yellow
        $TaskPassword = Read-Host "Senha" -AsSecureString
    }

    $plainPassword = Convert-SecureStringToPlainText -SecureString $TaskPassword
    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "Senha vazia. A tarefa nao foi criada."
    }

    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy Bypass",
        "-File `"$watchdogScript`"",
        "-SourceRoot `"$SourceRoot`"",
        "-RuntimeRoot `"$RuntimeRoot`"",
        "-DataRoot `"$DataRoot`"",
        "-BackendPort $BackendPort",
        "-FrontendPort $FrontendPort",
        "-PostgresServiceName `"$PostgresServiceName`"",
        "-CloudflaredServiceName `"$CloudflaredServiceName`""
    ) -join " "

    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument $arguments `
        -WorkingDirectory $RuntimeRoot

    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    $minuteTrigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Days 3650)

    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries

    $description = "Monitora e retoma automaticamente o FROTAS a partir do runtime local $RuntimeRoot."

    try {
        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger @($startupTrigger, $minuteTrigger) `
            -Settings $settings `
            -User $TaskUser `
            -Password $plainPassword `
            -RunLevel Highest `
            -Description $description `
            -Force | Out-Null
    }
    finally {
        $plainPassword = $null
    }

    Write-Host "Tarefa '$TaskName' registrada com sucesso." -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         FROTA - Instalacao da Auto-Retomada" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Fonte   : $SourceRoot"
Write-Host "Runtime : $RuntimeRoot"
Write-Host "Dados   : $DataRoot"
Write-Host ""

Ensure-Directory -Path $RuntimeRoot
Ensure-Directory -Path (Join-Path $RuntimeRoot "storage\logs")
Ensure-Directory -Path (Join-Path $RuntimeRoot "storage\runtime")
Ensure-Directory -Path $DataRoot

Sync-RepositoryToRuntime
Ensure-RuntimeEnv
Migrate-LegacyStorage

if (-not $SkipDependencyInstall) {
    Install-BackendDependencies
    Install-FrontendDependencies
    Invoke-RuntimeMigrations
}
else {
    Write-Host "Instalacao de dependencias ignorada por parametro." -ForegroundColor Yellow
}

Configure-ServiceRecovery -ServiceName $CloudflaredServiceName
Configure-ServiceRecovery -ServiceName $PostgresServiceName
Disable-LegacyTask
Register-WatchdogTask

if ($RunOnceAfterInstall) {
    $watchdogScript = Join-Path $RuntimeRoot "scripts\frota-watchdog.ps1"
    Write-Host "Executando watchdog uma vez..." -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $watchdogScript `
        -SourceRoot $SourceRoot `
        -RuntimeRoot $RuntimeRoot `
        -DataRoot $DataRoot `
        -BackendPort $BackendPort `
        -FrontendPort $FrontendPort `
        -PostgresServiceName $PostgresServiceName `
        -CloudflaredServiceName $CloudflaredServiceName
}

Write-Host ""
Write-Host "Auto-retomada configurada." -ForegroundColor Green
Write-Host "Logs: $(Join-Path $RuntimeRoot 'storage\logs\frota-watchdog.log')"
Write-Host "Para testar manualmente: powershell -NoProfile -ExecutionPolicy Bypass -File `"$RuntimeRoot\scripts\frota-watchdog.ps1`""
