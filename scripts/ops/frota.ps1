[CmdletBinding()]
param(
    [ValidateSet("Menu", "Start", "Publish", "Stop", "Reset", "Status", "Logs", "Backup", "Migrate", "Update", "FullReset")]
    [string]$Action = "Menu",
    [int]$Port = 8000,
    [switch]$BuildFrontend = $true,
    [switch]$SeedDemoData = $true,
    [switch]$InstallDeps,
    [switch]$SkipGitPull,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$opsRoot = $PSScriptRoot
$repoRoot = Convert-Path (Join-Path $opsRoot "..\..")

. (Join-Path $opsRoot "common.ps1")

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

function Invoke-Action {
    param([Parameter(Mandatory = $true)][string]$SelectedAction)

    switch ($SelectedAction) {
        "Start" {
            & (Join-Path $opsRoot "start-dev.ps1") -Port $Port -BuildFrontend:$BuildFrontend -SeedDemoData:$SeedDemoData
        }
        "Publish" {
            & (Join-Path $opsRoot "start-dev.ps1") -Port 80 -AppHost "127.0.0.1" -Production -BuildFrontend:$BuildFrontend -SeedDemoData:$SeedDemoData
        }
        "Stop" {
            & (Join-Path $opsRoot "stop-dev.ps1") -Port $Port
        }
        "Reset" {
            & (Join-Path $opsRoot "reset-dev.ps1") -Port $Port
        }
        "Status" {
            & (Join-Path $opsRoot "status-dev.ps1") -Port $Port
        }
        "Logs" {
            & (Join-Path $opsRoot "logs-local.ps1")
        }
        "Backup" {
            & (Join-Path $repoRoot "scripts\backup-local.ps1")
        }
        "Migrate" {
            Push-Location (Join-Path $repoRoot "backend")
            try {
                $alembic = Join-Path $repoRoot "backend\.venv\Scripts\alembic.exe"
                if (-not (Test-Path -LiteralPath $alembic)) {
                    throw "Alembic não encontrado em '$alembic'. Inicie o ambiente uma vez para criar a venv."
                }

                Write-Host "Aplicando migrations (upgrade heads)..." -ForegroundColor Cyan
                Invoke-CheckedCommand -Label "Alembic upgrade heads" -Command { & $alembic upgrade heads }
                Write-Host "Migrations aplicadas com sucesso." -ForegroundColor Green
            }
            finally {
                Pop-Location
            }
        }
        "Update" {
            Set-Location $repoRoot

            if (-not $SkipGitPull) {
                Write-Host "Atualizando repositório (git pull --ff-only)..." -ForegroundColor Cyan
                Invoke-CheckedCommand -Label "git pull" -Command { git pull --ff-only }
            }

            if ($InstallDeps) {
                $python = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
                if (Test-Path -LiteralPath $python) {
                    Write-Host "Atualizando dependências Python..." -ForegroundColor Cyan
                    Invoke-CheckedCommand -Label "pip install -r requirements.txt" -Command { & $python -m pip install -r (Join-Path $repoRoot "backend\requirements.txt") }
                }
            }

            & $PSCommandPath -Action Migrate -NoPause

            if ($BuildFrontend) {
                Push-Location (Join-Path $repoRoot "frontend")
                try {
                    if (-not (Test-Path -LiteralPath "node_modules")) {
                        Write-Host "Instalando dependências do frontend..." -ForegroundColor Cyan
                        Invoke-CheckedCommand -Label "npm install" -Command { npm install }
                    }
                    Write-Host "Gerando build do frontend..." -ForegroundColor Cyan
                    Invoke-CheckedCommand -Label "npm run build" -Command { npm run build }
                }
                finally {
                    Pop-Location
                }
            }

            Write-Host "Atualização concluída." -ForegroundColor Green
        }
        "FullReset" {
            & (Join-Path $repoRoot "scripts\reset_frota.ps1")
        }
        default {
            throw "Ação não suportada: $SelectedAction"
        }
    }
}

function Show-Menu {
    Clear-Host
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host " FROTA - Central Operacional" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host "[1] Iniciar local (porta 8000)"
    Write-Host "[2] Publicar local (porta 80)"
    Write-Host "[3] Parar ambiente"
    Write-Host "[4] Reset operacional (app/logs)"
    Write-Host "[5] Status"
    Write-Host "[6] Logs"
    Write-Host "[7] Backup"
    Write-Host "[8] Aplicar migrations"
    Write-Host "[9] Atualizar (git pull + migrate + build)"
    Write-Host "[10] Reset completo do banco"
    Write-Host "[0] Sair"
    Write-Host ""

    $option = Read-Host "Escolha uma opção"
    $selectedAction = switch ($option) {
        "1" { "Start" }
        "2" { "Publish" }
        "3" { "Stop" }
        "4" { "Reset" }
        "5" { "Status" }
        "6" { "Logs" }
        "7" { "Backup" }
        "8" { "Migrate" }
        "9" { "Update" }
        "10" { "FullReset" }
        "0" { $null }
        default { "Invalid" }
    }

    if ($selectedAction -eq "Invalid") {
        Write-Host "Opção inválida." -ForegroundColor Red
        return $true
    }

    if (-not $selectedAction) {
        Write-Host "Encerrando central operacional." -ForegroundColor Yellow
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
    Read-Host "Concluído. Pressione Enter para fechar"
}
