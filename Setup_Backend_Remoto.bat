@echo off
REM ============================================
REM  FROTA - Setup Backend com PostgreSQL Remoto
REM ============================================
cd /d "%~dp0"
title FROTA - Setup Backend (PostgreSQL Remote)
color 0B

REM Pedir informações do PostgreSQL
echo.
echo ===============================================
echo  FROTA - Configuracao de Backend Remoto
echo ===============================================
echo.
set /p PG_HOST="IP ou hostname do PostgreSQL: "
set /p PG_PORT="Porta PostgreSQL (padrao 5432): "
if "%PG_PORT%"=="" set PG_PORT=5432

echo.
echo Conectando em: %PG_HOST%:%PG_PORT%
echo.

REM Executar setup script
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-remote-backend.ps1" -PostgresHost "%PG_HOST%" -PostgresPort %PG_PORT%

pause
