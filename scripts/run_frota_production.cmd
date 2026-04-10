@echo off
set LOGDIR=%LOCALAPPDATA%\FrotaPMTF
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo [%date% %time%] Iniciando launcher do Frota PMTF >> "%LOGDIR%\frota-service.log"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_frota_production.ps1" >> "%LOGDIR%\frota-service.log" 2>&1
