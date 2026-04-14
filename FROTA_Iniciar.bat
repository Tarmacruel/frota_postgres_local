@echo off
REM ============================================
REM  FROTA - Central Operacional de Gestao
REM  Iniciar com Menu Interativo
REM ============================================
cd /d "%~dp0"
title FROTA - Central Operacional
color 0A
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\ops\frota.ps1" -Action Menu
pause
