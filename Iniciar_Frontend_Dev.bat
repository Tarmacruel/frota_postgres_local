@echo off
REM ================================================
REM  FROTA Frontend Dev - Network Mode
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
title FROTA Frontend Dev Server
color 0A

cls
echo.
echo ================================================
echo  FROTA FRONTEND DEV SERVER - Network Mode
echo ================================================
echo.
echo Iniciando Vite dev server em :3001
echo Acessível em toda a rede local
echo.
echo Pressione Ctrl+C para parar
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-frontend-dev.ps1" -Port 3001

pause
