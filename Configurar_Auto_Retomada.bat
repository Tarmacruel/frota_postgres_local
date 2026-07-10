@echo off
cd /d "%~dp0"
title FROTA - Auto-Retomada
color 0A
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-frota-watchdog.ps1"
pause
