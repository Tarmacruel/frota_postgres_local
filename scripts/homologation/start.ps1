[CmdletBinding()]
param([switch]$StartSignerAgent)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Assert-HmlRepository
$mount = Assert-HmlSecureVolume
$config = Get-HmlConfiguration
$runtimeRoot = Join-Path $mount "runtime"
$logsRoot = Join-Path $mount "logs"
$backendRoot = Join-Path $repoRoot "backend"
$frontendRoot = Join-Path $repoRoot "frontend"
$envPath = Join-Path $mount "config\backend.env"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"
$vite = Join-Path $frontendRoot "node_modules\vite\bin\vite.js"
$node = Get-Command node.exe -ErrorAction SilentlyContinue

foreach ($path in @($runtimeRoot, $logsRoot)) {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw "Secure backend environment is missing. Run setup.ps1." }
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "Independent backend virtualenv is missing. Run setup.ps1 -InstallDependencies." }
if (-not $node -or -not (Test-Path -LiteralPath $vite -PathType Leaf)) { throw "Independent frontend dependencies are missing. Run setup.ps1 -InstallDependencies." }

$values = Read-HmlEnvFile -Path $envPath
Assert-HmlBackendEnvironment -Values $values -Config $config

foreach ($port in @(3010, 8010, 54174)) {
    if (Test-HmlPortListening -Port $port) {
        throw "Homologation port $port is already in use. Run status.ps1 and stop.ps1 before retrying."
    }
}

$postgresWasRunning = Test-HmlPortListening -Port 5440
Start-HmlPostgres -Config $config

$previousEnvironment = @{}
foreach ($name in $values.Keys) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, [string]$values[$name], "Process")
}

$started = New-Object Collections.Generic.List[string]
try {
    Push-Location $backendRoot
    try {
        & $python -c "from app.core.config import settings; assert settings.APP_ENV == 'homologation'; assert str(settings.STORAGE_DIR).startswith(r'D:\FROTAS\frota_certificado_homologacao\.runtime-secure'); assert ':5440/frota_hml' in settings.DATABASE_URL"
        if ($LASTEXITCODE -ne 0) { throw "Effective backend settings are not isolated." }
    }
    finally { Pop-Location }

    $backend = Start-Process -FilePath $python -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8010") -WorkingDirectory $backendRoot -RedirectStandardOutput (Join-Path $logsRoot "backend.out.log") -RedirectStandardError (Join-Path $logsRoot "backend.err.log") -WindowStyle Hidden -PassThru
    Write-HmlPidRecord -Name "backend" -Process $backend -RuntimeRoot $runtimeRoot -WorkingDirectory $backendRoot
    $started.Add("backend")

    $oldProxy = [Environment]::GetEnvironmentVariable("VITE_API_PROXY_TARGET", "Process")
    $oldBase = [Environment]::GetEnvironmentVariable("VITE_API_BASE_URL", "Process")
    $oldAppEnv = [Environment]::GetEnvironmentVariable("VITE_APP_ENV", "Process")
    $oldHomologation = [Environment]::GetEnvironmentVariable("VITE_HOMOLOGATION", "Process")
    $oldCertificateSigning = [Environment]::GetEnvironmentVariable("VITE_CERTIFICATE_SIGNING_ENABLED", "Process")
    $oldAgentUrl = [Environment]::GetEnvironmentVariable("VITE_SIGNATURE_AGENT_URL", "Process")
    $oldSignatureBackendUrl = [Environment]::GetEnvironmentVariable("VITE_SIGNATURE_BACKEND_URL", "Process")
    $oldFrontendHost = [Environment]::GetEnvironmentVariable("VITE_FRONTEND_HOST", "Process")
    $oldFrontendPort = [Environment]::GetEnvironmentVariable("VITE_FRONTEND_PORT", "Process")
    [Environment]::SetEnvironmentVariable("VITE_API_PROXY_TARGET", "http://127.0.0.1:8010", "Process")
    [Environment]::SetEnvironmentVariable("VITE_API_BASE_URL", "/api", "Process")
    [Environment]::SetEnvironmentVariable("VITE_APP_ENV", "homologation", "Process")
    [Environment]::SetEnvironmentVariable("VITE_HOMOLOGATION", "true", "Process")
    [Environment]::SetEnvironmentVariable("VITE_CERTIFICATE_SIGNING_ENABLED", [string]$values["CERTIFICATE_SIGNING_ENABLED"], "Process")
    [Environment]::SetEnvironmentVariable("VITE_SIGNATURE_AGENT_URL", "http://127.0.0.1:54174", "Process")
    [Environment]::SetEnvironmentVariable("VITE_SIGNATURE_BACKEND_URL", "http://127.0.0.1:8010", "Process")
    [Environment]::SetEnvironmentVariable("VITE_FRONTEND_HOST", "127.0.0.1", "Process")
    [Environment]::SetEnvironmentVariable("VITE_FRONTEND_PORT", "3010", "Process")
    try {
        $frontend = Start-Process -FilePath $node.Source -ArgumentList @($vite, "--host", "127.0.0.1", "--port", "3010", "--strictPort") -WorkingDirectory $frontendRoot -RedirectStandardOutput (Join-Path $logsRoot "frontend.out.log") -RedirectStandardError (Join-Path $logsRoot "frontend.err.log") -WindowStyle Hidden -PassThru
    }
    finally {
        [Environment]::SetEnvironmentVariable("VITE_API_PROXY_TARGET", $oldProxy, "Process")
        [Environment]::SetEnvironmentVariable("VITE_API_BASE_URL", $oldBase, "Process")
        [Environment]::SetEnvironmentVariable("VITE_APP_ENV", $oldAppEnv, "Process")
        [Environment]::SetEnvironmentVariable("VITE_HOMOLOGATION", $oldHomologation, "Process")
        [Environment]::SetEnvironmentVariable("VITE_CERTIFICATE_SIGNING_ENABLED", $oldCertificateSigning, "Process")
        [Environment]::SetEnvironmentVariable("VITE_SIGNATURE_AGENT_URL", $oldAgentUrl, "Process")
        [Environment]::SetEnvironmentVariable("VITE_SIGNATURE_BACKEND_URL", $oldSignatureBackendUrl, "Process")
        [Environment]::SetEnvironmentVariable("VITE_FRONTEND_HOST", $oldFrontendHost, "Process")
        [Environment]::SetEnvironmentVariable("VITE_FRONTEND_PORT", $oldFrontendPort, "Process")
    }
    Write-HmlPidRecord -Name "frontend" -Process $frontend -RuntimeRoot $runtimeRoot -WorkingDirectory $frontendRoot
    $started.Add("frontend")

    if ($StartSignerAgent) {
        $agent = Join-Path $repoRoot "signature-agent\artifacts\win-x64\FrotaSigner-HML.exe"
        if (-not (Test-Path -LiteralPath $agent -PathType Leaf)) { throw "Signer agent is not published at '$agent'." }
        $agentProcess = Start-Process -FilePath $agent -ArgumentList @("--host", "127.0.0.1", "--port", "54174", "--environment", "homologation") -WorkingDirectory (Split-Path $agent -Parent) -RedirectStandardOutput (Join-Path $logsRoot "signer-agent.out.log") -RedirectStandardError (Join-Path $logsRoot "signer-agent.err.log") -WindowStyle Hidden -PassThru
        Write-HmlPidRecord -Name "signer-agent" -Process $agentProcess -RuntimeRoot $runtimeRoot -WorkingDirectory (Split-Path $agent -Parent)
        $started.Add("signer-agent")
    }

    $deadline = (Get-Date).AddSeconds(45)
    do {
        Start-Sleep -Milliseconds 500
        try {
            $backendReady = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8010/api/health/ready" -TimeoutSec 2).StatusCode -eq 200
        }
        catch { $backendReady = $false }
        try {
            $frontendReady = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3010" -TimeoutSec 2).StatusCode -eq 200
        }
        catch { $frontendReady = $false }
    } until (($backendReady -and $frontendReady) -or (Get-Date) -ge $deadline)
    if (-not $backendReady -or -not $frontendReady) { throw "Homologation health checks did not become ready within 45 seconds." }

    Write-HmlAuditLog -Event "environment_started" -Data @{ frontendPort = 3010; backendPort = 8010; postgresPort = 5440; signerAgentStarted = [bool]$StartSignerAgent }
    Write-Host "Homologation ready: http://127.0.0.1:3010" -ForegroundColor Green
    Write-Host "Backend health: http://127.0.0.1:8010/api/health/ready" -ForegroundColor Cyan
}
catch {
    for ($index = $started.Count - 1; $index -ge 0; $index--) {
        Stop-HmlOwnedProcess -Name $started[$index] -RuntimeRoot $runtimeRoot | Out-Null
    }
    if (-not $postgresWasRunning) { Stop-HmlPostgres }
    throw
}
finally {
    foreach ($name in $values.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process")
    }
}
