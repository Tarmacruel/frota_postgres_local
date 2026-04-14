[CmdletBinding()]
param(
    [int]$Port = 8000,
    [switch]$ShowNetwork
)

$ErrorActionPreference = "Stop"

# Find repository root
$repoRoot = $PWD
while ($repoRoot -ne $repoRoot.Substring(0, 3)) {
    if (Test-Path (Join-Path $repoRoot ".git")) {
        break
    }
    $repoRoot = Split-Path $repoRoot -Parent
}

$backendDir = Join-Path $repoRoot "backend"
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"

# Validate
if (-not (Test-Path $pythonExe)) {
    Write-Host "[ERR] venv not found at $backendDir" -ForegroundColor Red
    Write-Host "Run Setup first: Setup_Backend_Remoto.bat" -ForegroundColor Yellow
    exit 1
}

# Get machine IP address
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object {$_.IPAddress -notlike "127.*"} | Select-Object -First 1).IPAddress
if (-not $ipAddress) {
    $ipAddress = "localhost"
}

Write-Host "" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           FROTA DEV SERVER - Network Accessible           " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting on port $Port..." -ForegroundColor Yellow
Write-Host ""

# Display connection URLs
Write-Host "[LOCAL] LOCAL ACCESS (this machine):" -ForegroundColor White
Write-Host "   http://localhost:$Port" -ForegroundColor Cyan
Write-Host "   http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "[NETWORK] NETWORK ACCESS (other machines):" -ForegroundColor White
Write-Host "   http://$ipAddress`:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "[ENDPOINTS]:" -ForegroundColor White
Write-Host "   API: http://$ipAddress`:$Port/api" -ForegroundColor Gray
Write-Host "   Swagger: http://$ipAddress`:$Port/docs" -ForegroundColor Gray
Write-Host "   ReDoc: http://$ipAddress`:$Port/redoc" -ForegroundColor Gray
Write-Host ""
Write-Host "[STOP] Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start backend
Set-Location $backendDir
& $pythonExe -m uvicorn app.main:app --host 0.0.0.0 --port $Port --reload
