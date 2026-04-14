@echo off
REM ================================================
REM  FROTA - Cleanup Old Scripts
REM  Remove scripts antigos não mais usados
REM ================================================

setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo ================================================
echo  FROTA - Script Cleanup
echo ================================================
echo.
echo Removendo scripts antigos...
echo.

REM Remove BAT files
del /q "Backup_Frota_Local.bat" 2>nul && echo ✂️  Removed: Backup_Frota_Local.bat
del /q "Iniciar_Frota_Local.bat" 2>nul && echo ✂️  Removed: Iniciar_Frota_Local.bat
del /q "Parar_Frota_Local.bat" 2>nul && echo ✂️  Removed: Parar_Frota_Local.bat
del /q "Resetar_Frota_Local.bat" 2>nul && echo ✂️  Removed: Resetar_Frota_Local.bat
del /q "FROTA_Atualizar.bat" 2>nul && echo ✂️  Removed: FROTA_Atualizar.bat
del /q "FROTA_Backup.bat" 2>nul && echo ✂️  Removed: FROTA_Backup.bat
del /q "FROTA_Migracoes.bat" 2>nul && echo ✂️  Removed: FROTA_Migracoes.bat
del /q "FROTA_Resetar.bat" 2>nul && echo ✂️  Removed: FROTA_Resetar.bat
del /q "FROTA_Status.bat" 2>nul && echo ✂️  Removed: FROTA_Status.bat

echo.
echo Removendo scripts PowerShell antigos...
echo.

REM Remove PS1 files
del /q "scripts\activate-sqlite.ps1" 2>nul && echo ✂️  Removed: scripts\activate-sqlite.ps1
del /q "scripts\backup-local.ps1" 2>nul && echo ✂️  Removed: scripts\backup-local.ps1
del /q "scripts\backup_frota.ps1" 2>nul && echo ✂️  Removed: scripts\backup_frota.ps1
del /q "scripts\reset_frota.ps1" 2>nul && echo ✂️  Removed: scripts\reset_frota.ps1
del /q "scripts\run-local.ps1" 2>nul && echo ✂️  Removed: scripts\run-local.ps1
del /q "scripts\run_frota_production.cmd" 2>nul && echo ✂️  Removed: scripts\run_frota_production.cmd
del /q "scripts\run_frota_production.ps1" 2>nul && echo ✂️  Removed: scripts\run_frota_production.ps1
del /q "scripts\start_frota.ps1" 2>nul && echo ✂️  Removed: scripts\start_frota.ps1
del /q "scripts\start_local_postgres.ps1" 2>nul && echo ✂️  Removed: scripts\start_local_postgres.ps1
del /q "scripts\stop_frota.ps1" 2>nul && echo ✂️  Removed: scripts\stop_frota.ps1

echo.
echo ================================================
echo  ✅ Cleanup Completo!
echo ================================================
echo.
echo Scripts mantidos (novos):
echo.
echo .bat:
echo   - FROTA_Iniciar.bat (menu principal)
echo   - FROTA_Parar.bat (encerra)
echo   - Publicar_Frota_80.bat (producao)
echo   - Setup_Backend_Remoto.bat (setup)
echo   - Rodar_Backend.bat (backend simples)
echo   - Iniciar_Dev_Server.bat (backend dev)
echo   - Iniciar_Frontend_Dev.bat (frontend dev)
echo   - Iniciar_Stack_Dev.bat (ambos)
echo.
echo scripts/ PowerShell:
echo   - run-dev-server.ps1
echo   - run-frontend-dev.ps1
echo   - setup-remote-backend.ps1
echo   - ops/ (menu system)
echo.
echo Documentacao:
echo   - DEV_SERVER_GUIDE.md
echo   - SETUP_REMOTE_INSTRUCTIONS.md
echo   - README.md
echo.

pause
