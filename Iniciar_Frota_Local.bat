@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start_frota.ps1" -BuildFrontend -SeedDemoData -Port 8000
