@echo off
REM ============================================
REM  FROTA - Publicar em Modo Producao (80)
REM  Compativel com Cloudflare Tunnel
REM ============================================
cd /d "%~dp0"
title FROTA - Publicacao em Producao
color 0B
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\ops\frota.ps1" -Action Publish
pause
