@echo off
REM ================================================
REM  FROTA Dev Server - Network Mode
REM  Acessível de qualquer máquina da rede
REM ================================================

REM Encontrar raiz do repositório
cd /d "%~dp0"
if exist ".git" (
    goto root_found
)

cd ..
if exist ".git" (
    goto root_found
)

echo ❌ ERRO: .git nao encontrado
echo Execute este script de dentro do repositório
pause
exit /b 1

:root_found
title FROTA Dev Server
color 0B

cls
echo.
echo ================================================
echo  FROTA DEV SERVER - Network Mode
echo ================================================
echo.
echo Iniciando backend em 0.0.0.0:8000
echo Acessível em toda a rede local
echo.
echo Pressione Ctrl+C para parar
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-dev-server.ps1" -Port 8000

pause
