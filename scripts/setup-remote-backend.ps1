[CmdletBinding()]
param(
    [string]$RepoPath = "z:\FROTAS\frota_postgres_local",
    [int]$PostgresPort = 5432,
    [string]$PostgresHost = "localhost",
    [string]$DbName = "frota_db",
    [string]$DbUser = "frota_user",
    [string]$DbPassword = "frota_secret"
)

$ErrorActionPreference = "Stop"

function New-SecureToken {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

Write-Host "" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         FROTA - Setup Backend (PostgreSQL Remote)         " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Validate repository
if (-not (Test-Path $RepoPath)) {
    Write-Host "[ERR] Repository not found at: $RepoPath" -ForegroundColor Red
    exit 1
}

$backendDir = Join-Path $RepoPath "backend"
$venvDir = Join-Path $backendDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"
$pipExe = Join-Path $venvDir "Scripts\pip.exe"
$requirementsFile = Join-Path $backendDir "requirements.txt"
$envFile = Join-Path $backendDir ".env"
$envExampleFile = Join-Path $backendDir ".env.example"

# Step 1: Create venv
if (-not (Test-Path $pythonExe)) {
    Write-Host "Setup [1/6] Creating Python virtual environment..." -ForegroundColor Yellow
    Push-Location $backendDir
    python -m venv .venv
    Pop-Location
    Write-Host "[OK] venv created" -ForegroundColor Green
}
else {
    Write-Host "[OK] [1/6] venv already exists" -ForegroundColor Green
}

# Step 2: Install dependencies
Write-Host "[*] [2/6] Installing Python dependencies..." -ForegroundColor Yellow
if (-not (Test-Path $requirementsFile)) {
    throw "requirements.txt not found at $requirementsFile"
}
& $pipExe install --upgrade pip
& $pipExe install -r $requirementsFile
Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# Step 3: Configure .env
Write-Host "[*] [3/6] Configuring environment variables..." -ForegroundColor Yellow
$dbUrl = "postgresql+asyncpg://$DbUser`:$DbPassword@$PostgresHost`:$PostgresPort/$DbName"
$secretKey = New-SecureToken
$evidenceSecret = New-SecureToken

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExampleFile) {
        Copy-Item $envExampleFile $envFile
    }
}

# Create or update .env
$envContent = @"
DATABASE_URL=$dbUrl
SECRET_KEY=$secretKey
SIGNATURE_EVIDENCE_SECRET=$evidenceSecret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
CORS_ORIGINS=["https://frota.sirel.com.br"]
CSRF_TRUSTED_ORIGINS=["https://frota.sirel.com.br"]
TRUSTED_HOSTS=["frota.sirel.com.br","localhost","127.0.0.1"]
TRUSTED_PROXY_NETWORKS=["127.0.0.1/32","::1/128"]
COOKIE_NAME=access_token
CSRF_COOKIE_NAME=csrf_token
COOKIE_SECURE=true
MAX_REQUEST_BODY_BYTES=67108864
APP_ENV=production
"@

Set-Content $envFile $envContent

Write-Host "[OK] .env configured for: $PostgresHost`:$PostgresPort/$DbName" -ForegroundColor Green

# Step 4: Test PostgreSQL connection
Write-Host "[*] [4/6] Testing PostgreSQL connection..." -ForegroundColor Yellow

$testCode = @"
import asyncpg
import asyncio

async def test():
    try:
        conn = await asyncpg.connect(
            host='$PostgresHost',
            port=$PostgresPort,
            user='$DbUser',
            password='$DbPassword',
            database='$DbName'
        )
        version = await conn.fetchval('SELECT version();')
        await conn.close()
        print('OK Connected')
        return True
    except Exception as e:
        print('ERROR: ' + str(e))
        return False

asyncio.run(test())
"@

& $pythonExe -c $testCode
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Warning: PostgreSQL did not respond - may be initializing" -ForegroundColor Yellow
}

# Step 5: Apply migrations
Write-Host "[*] [5/6] Applying migrations..." -ForegroundColor Yellow
Push-Location $backendDir
& $pythonExe -m alembic upgrade head 2>&1
Pop-Location
Write-Host "[OK] Migrations completed" -ForegroundColor Green

# Step 6: Final Summary
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           OK - SETUP COMPLETED SUCCESSFULLY!               " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Start Backend:" -ForegroundColor White
Write-Host "   FROTA_Iniciar.bat -> Iniciar backend" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Or run manually:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Cyan
Write-Host "   powershell -File ..\scripts\run-backend-production.ps1 -Port 8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "CONNECTION INFORMATION:" -ForegroundColor Yellow
Write-Host "   PostgreSQL: $PostgresHost`:$PostgresPort" -ForegroundColor White
Write-Host "   Database: $DbName" -ForegroundColor White
Write-Host "   User: $DbUser" -ForegroundColor White
Write-Host "   Backend: http://localhost:8000" -ForegroundColor White
Write-Host ""
Write-Host ".env created at: $envFile" -ForegroundColor Gray
Write-Host ""
