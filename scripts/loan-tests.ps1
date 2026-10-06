[CmdletBinding()]
param([ValidateSet('start', 'stop', 'status', 'migrate')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$testRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($testRoot -ne 'D:\FROTAS\frota_emprestimos_testes') { throw 'Unexpected test root.' }
$python = Join-Path $testRoot 'backend\.venv\Scripts\python.exe'
$runner = Join-Path $testRoot 'scripts\loan_test_runtime.py'
$runtime = Join-Path $testRoot 'storage\loan-tests'
$cluster = Join-Path $runtime 'cluster'
$pgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
$pidFile = Join-Path $runtime 'api-process.json'
& $python $runner validate
if ($LASTEXITCODE -ne 0) { throw 'Test isolation validation failed.' }

function Get-OwnedApiProcess {
    if (-not (Test-Path -LiteralPath $pidFile)) { return $null }
    $record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.id)"
    if (-not $process) { return $null }
    if ($process.CommandLine -notlike "*$runner*run*" -or $process.ExecutablePath -notlike "$testRoot\backend\.venv\Scripts\python.exe") {
        throw 'Recorded PID belongs to another process; refusing to act.'
    }
    if ($process.CreationDate.ToUniversalTime().ToString('o') -ne $record.createdAt) { throw 'Recorded PID was reused.' }
    return $process
}

if ($Action -eq 'start') {
    & $pgCtl -D $cluster status *> $null
    if ($LASTEXITCODE -ne 0) {
        if (Get-NetTCPConnection -LocalPort 5441 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5441 already occupied.' }
        & $pgCtl -D $cluster -l (Join-Path $runtime 'postgres.log') -w start
        if ($LASTEXITCODE -ne 0) { throw 'Failed to start test PostgreSQL.' }
    }
    $existing = Get-OwnedApiProcess
    if (-not $existing) {
        if (Get-NetTCPConnection -LocalPort 6969 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 6969 already occupied.' }
        if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'frontend\dist\index.html'))) { throw 'Build the test frontend first.' }
        $process = Start-Process -FilePath $python -ArgumentList @($runner, 'run') -WorkingDirectory $testRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'api.out.log') -RedirectStandardError (Join-Path $runtime 'api.err.log')
        $identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
        @{ id = $process.Id; createdAt = $identity.CreationDate.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { $response = Invoke-RestMethod 'http://127.0.0.1:6969/api/health/ready' -TimeoutSec 2; $ready = $response.database -eq 'ok' } catch { }
        if ($ready) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Test API did not become ready; inspect storage\loan-tests\api.err.log.' }
    Write-Output 'Ambiente de testes: http://localhost:6969'
} elseif ($Action -eq 'stop') {
    $process = Get-OwnedApiProcess
    if ($process) { Stop-Process -Id $process.ProcessId -Force }
    if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
    & $pgCtl -D $cluster -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the test cluster (it may already be stopped).' }
} elseif ($Action -eq 'migrate') {
    & $python $runner migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
} else {
    & $pgCtl -D $cluster status
    $process = Get-OwnedApiProcess
    if ($process) { Write-Output "Test API PID: $($process.ProcessId)" }
    try { Invoke-RestMethod 'http://127.0.0.1:6969/api/health/ready' -TimeoutSec 3 } catch { Write-Output 'Test API stopped.' }
}
