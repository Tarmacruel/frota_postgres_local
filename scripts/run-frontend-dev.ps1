[CmdletBinding()]
param(
    [int]$Port = 3001
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

$frontendDir = Join-Path $repoRoot "frontend"
$package = Join-Path $frontendDir "package.json"

# Validate
if (-not (Test-Path $package)) {
    Write-Host "[ERR] package.json not found at $frontendDir" -ForegroundColor Red
    exit 1
}

# Get machine IP address
$ipAddress = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object {$_.IPAddress -notlike "127.*"} | Select-Object -First 1).IPAddress
if (-not $ipAddress) {
    $ipAddress = "localhost"
}

Write-Host "" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           FROTA FRONTEND - Network Accessible              " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Vite on port $Port..." -ForegroundColor Yellow
Write-Host ""

# Display connection URLs
Write-Host "[LOCAL] LOCAL ACCESS (this machine):" -ForegroundColor White
Write-Host "   http://localhost:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "[NETWORK] NETWORK ACCESS (other machines):" -ForegroundColor White
Write-Host "   http://$ipAddress`:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Requires Backend running at http://localhost:8000" -ForegroundColor Yellow
Write-Host ""
Write-Host "[STOP] Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start frontend
Set-Location $frontendDir
npm run dev -- --host 0.0.0.0 --port $Port
