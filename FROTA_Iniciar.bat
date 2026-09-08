@echo off
cd /d "%~dp0"
title FROTA - Central Operacional
color 0A
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-local-watchdog.ps1"
if not errorlevel 1 start "" "https://frota.sirel.com.br"
pause
