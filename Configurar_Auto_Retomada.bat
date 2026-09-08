@echo off
cd /d "%~dp0"
title FROTA - Auto-Retomada
color 0A
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-local-autostart.ps1" -SystemAccount
pause
