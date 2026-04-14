@echo off
REM ============================================
REM  FROTA - Encerrar (Menu Operacional)
REM ============================================
cd /d "%~dp0"
title FROTA - Encerrando...
color 0C
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\ops\frota.ps1" -Action Stop
pause
