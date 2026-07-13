[CmdletBinding()]
param(
    [string]$SourceRoot = "\\Sad61svr001\licitacao.1\FROTAS\frota_postgres_local",
    [string]$RuntimeRoot = "C:\FROTAS\frota_runtime",
    [string]$DataRoot = "",
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000,
    [string]$PostgresServiceName = "postgresql-x64-16",
    [string]$CloudflaredServiceName = "Cloudflared",
    [string]$PublicHealthUrl = "https://frota.sirel.com.br/api/health",
    [string]$InternetProbeUrl = "https://www.cloudflare.com/cdn-cgi/trace",
    [int]$CloudflaredRestartDebounceMinutes = 10,
    [switch]$SkipSync
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot = Join-Path $RuntimeRoot "data\uploads"
}
$DataRoot = [System.IO.Path]::GetFullPath($DataRoot)

$runtimeStorageRoot = Join-Path $RuntimeRoot "storage"
$runtimeLogRoot = Join-Path $runtimeStorageRoot "logs"
$runtimeStateRoot = Join-Path $runtimeStorageRoot "runtime"
$logPath = Join-Path $runtimeLogRoot "frota-watchdog.log"
$statePath = Join-Path $runtimeStateRoot "frota-watchdog-state.json"
$lockPath = Join-Path $runtimeStateRoot "frota-watchdog.lock"

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-WatchdogLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Level = "INFO"
    )

    Ensure-Directory -Path $runtimeLogRoot
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Host $line
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Read-WatchdogState {
    $state = @{}
    if (-not (Test-Path -LiteralPath $statePath)) {
        return $state
    }

    try {
        $json = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        foreach ($property in $json.PSObject.Properties) {
            $state[$property.Name] = $property.Value
        }
    }
    catch {
        Write-WatchdogLog -Message "Estado do watchdog invalido; um novo sera criado. $($_.Exception.Message)" -Level "WARN"
    }

    return $state
}

function Save-WatchdogState {
    param([Parameter(Mandatory = $true)][hashtable]$State)

    Ensure-Directory -Path $runtimeStateRoot
    $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Get-StateDate {
    param(
        [Parameter(Mandatory = $true)][hashtable]$State,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not $State.ContainsKey($Name) -or -not $State[$Name]) {
        return $null
    }

    try {
        return [datetime]::Parse([string]$State[$Name])
    }
    catch {
        return $null
    }
}

function Acquire-WatchdogLock {
    Ensure-Directory -Path $runtimeStateRoot

    if (Test-Path -LiteralPath $lockPath) {
        $lock = Get-Item -LiteralPath $lockPath -ErrorAction SilentlyContinue
        if ($lock -and $lock.LastWriteTime -gt (Get-Date).AddMinutes(-10)) {
            Write-WatchdogLog -Message "Outra execucao do watchdog ainda esta ativa. Encerrando esta rodada." -Level "WARN"
            return $false
        }

        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }

    New-Item -ItemType File -Path $lockPath -Force | Out-Null
    Set-Content -LiteralPath $lockPath -Value "pid=$PID started=$(Get-Date -Format s)" -Encoding ASCII
    return $true
}

function Release-WatchdogLock {
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}

function Invoke-HttpCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$TimeoutSeconds = 5
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds
        return [pscustomobject]@{
            Ok         = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
            StatusCode = $response.StatusCode
            Content    = [string]$response.Content
            Error      = ""
        }
    }
    catch {
        $statusCode = 0
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }

        return [pscustomobject]@{
            Ok         = $false
            StatusCode = $statusCode
            Content    = ""
            Error      = $_.Exception.Message
        }
    }
}

function Test-BackendHealth {
    $result = Invoke-HttpCheck -Url "http://127.0.0.1:$BackendPort/api/health" -TimeoutSeconds 5
    return ($result.Ok -and $result.Content -match '"status"\s*:\s*"ok"')
}

function Test-FrontendHealth {
    $result = Invoke-HttpCheck -Url "http://127.0.0.1:$FrontendPort/" -TimeoutSeconds 5
    return ($result.Ok -and $result.Content -match "Frota PMTF|SIREL|/src/main.jsx|/assets/index-")
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
            & $taskkill.Source /PID $ProcessId /T /F | Out-Null
            return
        }
        catch {
        }
    }

    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-PortProcess {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    $ownerPid = Get-PortOwnerPid -Port $Port
    if ($ownerPid) {
        Write-WatchdogLog -Message "Encerrando processo da porta $Port, PID $ownerPid. Motivo: $Reason" -Level "WARN"
        Stop-ProcessTreeSafe -ProcessId $ownerPid
        Start-Sleep -Seconds 2
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
    & $robocopy.Source $Source $Destination @ExtraArgs | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -ge 8) {
        throw "Robocopy falhou de '$Source' para '$Destination' com codigo $exitCode."
    }

    return $exitCode
}

function Sync-RepositoryToRuntime {
    if ($SkipSync) {
        Write-WatchdogLog -Message "Sincronizacao ignorada por parametro."
        return $false
    }

    if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
        Write-WatchdogLog -Message "SourceRoot vazio; sincronizacao ignorada." -Level "WARN"
        return $false
    }

    if (-not (Test-Path -LiteralPath $SourceRoot)) {
        Write-WatchdogLog -Message "Fonte de rede indisponivel: $SourceRoot. Usando runtime local existente." -Level "WARN"
        return $false
    }

    $sourceFull = [System.IO.Path]::GetFullPath($SourceRoot)
    if ($sourceFull.TrimEnd("\") -ieq $RuntimeRoot.TrimEnd("\")) {
        Write-WatchdogLog -Message "Fonte e runtime sao o mesmo caminho; sincronizacao ignorada."
        return $false
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

    $args = @("/MIR", "/R:2", "/W:2", "/XJ", "/NFL", "/NDL", "/NP", "/XD") + $excludeDirs
    $exitCode = Invoke-RobocopyChecked -Source $sourceFull -Destination $RuntimeRoot -ExtraArgs $args
    $changed = ($exitCode -ne 0)

    if ($changed) {
        Write-WatchdogLog -Message "Runtime local sincronizado a partir da rede. Robocopy=$exitCode"
    }
    else {
        Write-WatchdogLog -Message "Runtime local ja estava sincronizado."
    }

    return $changed
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

function Get-EnvFileValue {
    param([string]$Path, [string]$Name)
    $line = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -First 1
    if (-not $line) { return "" }
    return ($line -replace "^$([regex]::Escape($Name))=", "").Trim()
}

function New-SecureToken {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Set-ProductionEnvSecurity {
    param([string]$Path)
    $knownDefaults = @("", "supersecretkeychangeinproduction", "troque_este_secret_em_producao")
    $secret = Get-EnvFileValue -Path $Path -Name "SECRET_KEY"
    if ($knownDefaults -contains $secret -or $secret.Length -lt 32) {
        Update-EnvFileValue -Path $Path -Name "SECRET_KEY" -Value (New-SecureToken)
    }
    $evidenceSecret = Get-EnvFileValue -Path $Path -Name "SIGNATURE_EVIDENCE_SECRET"
    if ($evidenceSecret.Length -lt 32) {
        Update-EnvFileValue -Path $Path -Name "SIGNATURE_EVIDENCE_SECRET" -Value (New-SecureToken)
    }
    Update-EnvFileValue -Path $Path -Name "APP_ENV" -Value "production"
    Update-EnvFileValue -Path $Path -Name "COOKIE_SECURE" -Value "true"
    Update-EnvFileValue -Path $Path -Name "CORS_ORIGINS" -Value '["https://frota.sirel.com.br"]'
    Update-EnvFileValue -Path $Path -Name "CSRF_TRUSTED_ORIGINS" -Value '["https://frota.sirel.com.br"]'
    Update-EnvFileValue -Path $Path -Name "TRUSTED_HOSTS" -Value '["frota.sirel.com.br","localhost","127.0.0.1"]'
    Update-EnvFileValue -Path $Path -Name "TRUSTED_PROXY_NETWORKS" -Value '["127.0.0.1/32","::1/128"]'
}

function Ensure-BackendRuntimeEnv {
    $backendRoot = Join-Path $RuntimeRoot "backend"
    $envFile = Join-Path $backendRoot ".env"
    $envExample = Join-Path $backendRoot ".env.example"

    if (-not (Test-Path -LiteralPath $backendRoot)) {
        throw "Backend nao encontrado no runtime local: $backendRoot"
    }

    if (-not (Test-Path -LiteralPath $envFile)) {
        if (Test-Path -LiteralPath $envExample) {
            Copy-Item -LiteralPath $envExample -Destination $envFile -Force
        }
        else {
            @(
                "DATABASE_URL=postgresql+asyncpg://frota_user:frota_secret@127.0.0.1:5432/frota_db",
                "SECRET_KEY=$(New-SecureToken)",
                "SIGNATURE_EVIDENCE_SECRET=$(New-SecureToken)",
                "ALGORITHM=HS256",
                "ACCESS_TOKEN_EXPIRE_MINUTES=60",
                'CORS_ORIGINS=["https://frota.sirel.com.br"]',
                'CSRF_TRUSTED_ORIGINS=["https://frota.sirel.com.br"]',
                'TRUSTED_HOSTS=["frota.sirel.com.br","localhost","127.0.0.1"]',
                'TRUSTED_PROXY_NETWORKS=["127.0.0.1/32","::1/128"]',
                "COOKIE_NAME=access_token",
                "COOKIE_SECURE=true",
                "APP_ENV=production"
            ) | Set-Content -LiteralPath $envFile -Encoding UTF8
        }
    }

    Set-ProductionEnvSecurity -Path $envFile
    Ensure-Directory -Path $DataRoot
    Update-EnvFileValue -Path $envFile -Name "STORAGE_DIR" -Value $DataRoot
}

function Sync-LegacyUploadStorage {
    $legacyStorage = Join-Path $RuntimeRoot "backend\storage"
    if (-not (Test-Path -LiteralPath $legacyStorage)) {
        return
    }

    $args = @("/E", "/R:2", "/W:2", "/XJ", "/NFL", "/NDL", "/NP")
    $exitCode = Invoke-RobocopyChecked -Source $legacyStorage -Destination $DataRoot -ExtraArgs $args
    if ($exitCode -ne 0) {
        Write-WatchdogLog -Message "Arquivos legados de backend\storage copiados para STORAGE_DIR. Robocopy=$exitCode"
    }
}

function Ensure-ServiceRunning {
    param([Parameter(Mandatory = $true)][string]$Name)

    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-WatchdogLog -Message "Servico '$Name' nao encontrado." -Level "WARN"
        return $false
    }

    if ($service.Status -ne "Running") {
        Write-WatchdogLog -Message "Servico '$Name' esta $($service.Status). Tentando iniciar." -Level "WARN"
        try {
            Start-Service -Name $Name
            Start-Sleep -Seconds 5
            $service = Get-Service -Name $Name
        }
        catch {
            Write-WatchdogLog -Message "Nao foi possivel iniciar '$Name': $($_.Exception.Message)" -Level "WARN"
            return $false
        }
    }

    return ($service.Status -eq "Running")
}

function Restart-ServiceDebounced {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][hashtable]$State,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    $lastRestart = Get-StateDate -State $State -Name "lastCloudflaredRestartAt"
    if ($lastRestart -and $lastRestart -gt (Get-Date).AddMinutes(-$CloudflaredRestartDebounceMinutes)) {
        Write-WatchdogLog -Message "Reinicio de '$Name' ignorado por debounce. Motivo: $Reason" -Level "WARN"
        return
    }

    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-WatchdogLog -Message "Servico '$Name' nao encontrado para reinicio." -Level "WARN"
        return
    }

    Write-WatchdogLog -Message "Reiniciando '$Name'. Motivo: $Reason" -Level "WARN"
    try {
        Restart-Service -Name $Name -Force
        $State["lastCloudflaredRestartAt"] = (Get-Date).ToString("o")
    }
    catch {
        Write-WatchdogLog -Message "Nao foi possivel reiniciar '$Name': $($_.Exception.Message)" -Level "WARN"
    }
}

function Ensure-BackendDependencies {
    $backendRoot = Join-Path $RuntimeRoot "backend"
    $pythonExe = Join-Path $backendRoot ".venv\Scripts\python.exe"
    $requirements = Join-Path $backendRoot "requirements.txt"

    if (Test-Path -LiteralPath $pythonExe) {
        return
    }

    if (-not (Test-Path -LiteralPath $requirements)) {
        throw "requirements.txt nao encontrado no runtime local."
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    if (-not $python) {
        $python = Get-Command python -ErrorAction SilentlyContinue
    }
    if (-not $python) {
        throw "Python nao encontrado para criar backend\.venv."
    }

    Write-WatchdogLog -Message "Criando backend\.venv local."
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

function Ensure-FrontendDependencies {
    $frontendRoot = Join-Path $RuntimeRoot "frontend"
    $viteCmd = Join-Path $frontendRoot "node_modules\.bin\vite.cmd"
    $packageJson = Join-Path $frontendRoot "package.json"

    if (Test-Path -LiteralPath $viteCmd) {
        return
    }

    if (-not (Test-Path -LiteralPath $packageJson)) {
        throw "package.json do frontend nao encontrado no runtime local."
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
        throw "npm nao encontrado para instalar frontend\node_modules."
    }

    Write-WatchdogLog -Message "Instalando dependencias do frontend no runtime local."
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

function Invoke-MigrationsIfPossible {
    $backendRoot = Join-Path $RuntimeRoot "backend"
    $alembic = Join-Path $backendRoot ".venv\Scripts\alembic.exe"

    if (-not (Test-Path -LiteralPath $alembic)) {
        Write-WatchdogLog -Message "Alembic nao encontrado; migrations ignoradas." -Level "WARN"
        return
    }

    Write-WatchdogLog -Message "Aplicando migrations no runtime local."
    Push-Location $backendRoot
    try {
        & $alembic upgrade head
        if ($LASTEXITCODE -ne 0) {
            throw "alembic upgrade head falhou."
        }
    }
    finally {
        Pop-Location
    }
}

function Start-Backend {
    Ensure-BackendDependencies
    Ensure-BackendRuntimeEnv

    $backendRoot = Join-Path $RuntimeRoot "backend"
    $pythonExe = Join-Path $backendRoot ".venv\Scripts\python.exe"
    $outLog = Join-Path $runtimeLogRoot "frota-backend.out.log"
    $errLog = Join-Path $runtimeLogRoot "frota-backend.err.log"

    Stop-PortProcess -Port $BackendPort -Reason "backend sem resposta"
    Write-WatchdogLog -Message "Iniciando backend na porta $BackendPort."
    Start-Process `
        -FilePath $pythonExe `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$BackendPort", "--no-access-log") `
        -WorkingDirectory $backendRoot `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden | Out-Null
}

function Start-Frontend {
    Ensure-FrontendDependencies

    $frontendRoot = Join-Path $RuntimeRoot "frontend"
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
        throw "npm nao encontrado para iniciar frontend."
    }

    $outLog = Join-Path $runtimeLogRoot "frota-frontend.out.log"
    $errLog = Join-Path $runtimeLogRoot "frota-frontend.err.log"

    Stop-PortProcess -Port $FrontendPort -Reason "frontend sem resposta"
    Push-Location $frontendRoot
    try {
        & $npm.Source run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build falhou."
        }
    }
    finally {
        Pop-Location
    }

    Write-WatchdogLog -Message "Iniciando frontend com build de producao na porta $FrontendPort."
    Start-Process `
        -FilePath $npm.Source `
        -ArgumentList @("run", "preview", "--", "--host", "127.0.0.1", "--port", "$FrontendPort", "--strictPort") `
        -WorkingDirectory $frontendRoot `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden | Out-Null
}

Ensure-Directory -Path $runtimeLogRoot
Ensure-Directory -Path $runtimeStateRoot
Ensure-Directory -Path $DataRoot

if (-not (Acquire-WatchdogLock)) {
    exit 0
}

$state = Read-WatchdogState
$exitCode = 0

try {
    Write-WatchdogLog -Message "Rodada do watchdog iniciada. Runtime=$RuntimeRoot"

    $syncChanged = Sync-RepositoryToRuntime
    Ensure-BackendRuntimeEnv
    Sync-LegacyUploadStorage

    $postgresOk = Ensure-ServiceRunning -Name $PostgresServiceName
    $cloudflaredOk = Ensure-ServiceRunning -Name $CloudflaredServiceName

    if ($syncChanged) {
        Ensure-BackendDependencies
        Ensure-FrontendDependencies
        Invoke-MigrationsIfPossible
        Stop-PortProcess -Port $BackendPort -Reason "codigo sincronizado"
        Stop-PortProcess -Port $FrontendPort -Reason "codigo sincronizado"
        $state["lastSyncAt"] = (Get-Date).ToString("o")
    }

    $backendOk = Test-BackendHealth
    if (-not $backendOk) {
        Write-WatchdogLog -Message "Backend local nao respondeu; tentando recuperar." -Level "WARN"
        Start-Backend
        Start-Sleep -Seconds 8
        $backendOk = Test-BackendHealth
    }

    $frontendOk = Test-FrontendHealth
    if (-not $frontendOk) {
        Write-WatchdogLog -Message "Frontend local nao respondeu; tentando recuperar." -Level "WARN"
        Start-Frontend
        Start-Sleep -Seconds 8
        $frontendOk = Test-FrontendHealth
    }

    $publicHealth = Invoke-HttpCheck -Url $PublicHealthUrl -TimeoutSeconds 8
    if (-not $publicHealth.Ok) {
        $internetHealth = Invoke-HttpCheck -Url $InternetProbeUrl -TimeoutSeconds 8
        if (-not $internetHealth.Ok) {
            Write-WatchdogLog -Message "Internet aparenta indisponivel. Publico=$($publicHealth.Error)" -Level "WARN"
        }
        elseif ($backendOk -and $frontendOk -and $cloudflaredOk) {
            Restart-ServiceDebounced -Name $CloudflaredServiceName -State $state -Reason "saude publica falhou: $($publicHealth.Error)"
        }
        else {
            Write-WatchdogLog -Message "Saude publica falhou, mas ha pendencia local. Backend=$backendOk Frontend=$frontendOk Postgres=$postgresOk Cloudflared=$cloudflaredOk" -Level "WARN"
        }
    }

    Write-WatchdogLog -Message "Status final: backend=$backendOk frontend=$frontendOk postgres=$postgresOk cloudflared=$cloudflaredOk publico=$($publicHealth.Ok)"
    $state["lastRunAt"] = (Get-Date).ToString("o")
}
catch {
    $exitCode = 1
    Write-WatchdogLog -Message $_.Exception.Message -Level "ERROR"
}
finally {
    Save-WatchdogState -State $state
    Release-WatchdogLock
}

exit $exitCode
