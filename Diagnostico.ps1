#!/usr/bin/env powershell
# -*- Mode: PowerShell; coding: utf-8; -*-

<#
.SYNOPSIS
    FROTA Diagnostic System - Health check for all services
.DESCRIPTION
    Verifies PostgreSQL, ports, Python environment, Node.js, and configuration files
#>

param(
    [switch]$Verbose = $false
)

$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = if ($Verbose) { 'Continue' } else { 'SilentlyContinue' }

function Write-Status {
    param(
        [string]$Message,
        [ValidateSet('OK', 'FAIL', 'WARN', 'INFO')]$Status = 'INFO',
        [ValidateSet('Green', 'Red', 'Yellow', 'Cyan')]$Color = 'Cyan'
    )
    $StatusSymbol = @{
        'OK'   = '[OK]  '
        'FAIL' = '[ERR]'
        'WARN' = '[!]  '
        'INFO' = '[?]  '
    }
    Write-Host $StatusSymbol[$Status] -ForegroundColor $Color -NoNewline
    Write-Host $Message
}

function Test-Port {
    param(
        [int]$Port,
        [string]$Host = "127.0.0.1"
    )
    
    try {
        $result = netstat -ano -p tcp 2>$null | Select-String ":$Port\s"
        return $null -ne $result
    }
    catch {
        return $false
    }
}

# Header
Write-Host "" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "          FROTA - Diagnostic System        " -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'MM/dd/yyyy HH:mm:ss')" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan

$issuesFound = 0

# 1. PostgreSQL
Write-Host "[1] Checking PostgreSQL..." -ForegroundColor Yellow

$pgService = Get-Service PostgreSQL* -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }
if ($pgService) {
    Write-Status "PostgreSQL service running" "OK" "Green"
    
    if (Test-Port 5432) {
        Write-Status "PostgreSQL listening on :5432" "OK" "Green"
    }
    else {
        Write-Status "PostgreSQL active, but not listening on :5432" "WARN" "Yellow"
        $issuesFound++
    }
}
else {
    Write-Status "PostgreSQL NOT running" "FAIL" "Red"
    $issuesFound++
    Write-Host "  -> Solution: Run 'Iniciar_PostgreSQL.bat'" -ForegroundColor Yellow
}

# 2. System Ports
Write-Host "`n[2] Checking system ports..." -ForegroundColor Yellow

$ports = @{
    "3001" = "Frontend (dev)"
    "8000" = "Backend"
    "9009" = "Cloudflare Tunnel"
}

foreach ($port in $ports.GetEnumerator()) {
    if (Test-Port $port.Key) {
        Write-Status "$($port.Value) (port $($port.Key))" "OK" "Green"
    }
}

# 3. Python Environment
Write-Host "`n[3] Checking Python..." -ForegroundColor Yellow

$pythonPath = ".\backend\.venv\Scripts\python.exe"
if (Test-Path $pythonPath) {
    Write-Status "Python virtual environment found" "OK" "Green"
    
    # Test SQLAlchemy import
    try {
        & $pythonPath -c "import sqlalchemy; print(sqlalchemy.__version__)" -ErrorAction SilentlyContinue | Out-Null
        Write-Status "SQLAlchemy importable" "OK" "Green"
    }
    catch {
        Write-Status "Error importing SQLAlchemy" "WARN" "Yellow"
        $issuesFound++
    }
}
else {
    Write-Status "Python virtual environment NOT found" "FAIL" "Red"
    $issuesFound++
}

# 4. Node.js / Frontend
Write-Host "`n[4] Checking Node.js..." -ForegroundColor Yellow

$nodeVersion = node --version 2>$null
$npmVersion = npm --version 2>$null

if ($nodeVersion) {
    Write-Status "Node.js $nodeVersion" "OK" "Green"
    Write-Status "npm $npmVersion" "OK" "Green"
}
else {
    Write-Status "Node.js NOT installed" "FAIL" "Red"
    $issuesFound++
}

# 5. Configuration Files
Write-Host "`n[5] Checking configuration..." -ForegroundColor Yellow

$configFiles = @(
    ".env"
    "backend\.env"
    "frontend\package.json"
    "backend\alembic.ini"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Status "$file" "OK" "Green"
    }
    else {
        Write-Status "$file" "FAIL" "Red"
        $issuesFound++
    }
}

# 6. Database Connection
Write-Host "`n[6] Testing database connection..." -ForegroundColor Yellow

$env:PGPASSWORD = "frota_secret"
$pgTest = psql -h 127.0.0.1 -U frota_user -d postgres -c "SELECT 1;" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Status "PostgreSQL connection successful" "OK" "Green"
}
else {
    Write-Status "Error connecting to PostgreSQL" "WARN" "Yellow"
    $issuesFound++
    
    if ($pgTest -like "*password*") {
        Write-Host "  -> Possible password error. Check credentials in .env" -ForegroundColor Yellow
    }
    elseif ($pgTest -like "*connection refused*") {
        Write-Host "  -> Connection refused. PostgreSQL not listening." -ForegroundColor Yellow
    }
}

# Cleanup
$env:PGPASSWORD = ""

# Summary
Write-Host "`n" + ("=" * 44) -ForegroundColor Cyan
if ($issuesFound -eq 0) {
    Write-Host "[OK] System OK - Everything working!" -ForegroundColor Green
    Write-Host "  You can run: .\Iniciar_Stack_Dev.bat" -ForegroundColor Green
}
elseif ($issuesFound -eq 1) {
    Write-Host "[!] 1 issue found" -ForegroundColor Yellow
    Write-Host "  Consult TROUBLESHOOTING.md for solutions" -ForegroundColor Yellow
}
else {
    Write-Host "[ERR] $issuesFound issues found" -ForegroundColor Red
    Write-Host "  Consult TROUBLESHOOTING.md for solutions" -ForegroundColor Red
}
Write-Host ("=" * 44) -ForegroundColor Cyan

exit $issuesFound
