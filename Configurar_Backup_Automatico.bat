@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\install-local-autostart.ps1" -SystemAccount
pause
