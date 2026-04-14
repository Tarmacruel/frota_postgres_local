@echo off
REM ================================================
REM  FROTA - Start Full Dev Stack
REM  Backend + Frontend - Network Accessible
REM ================================================

REM Encontrar raiz do repositório
cd /d "%~dp0"
if exist ".git" (
    goto root_found
)

cd ..
if exist ".git" (
    goto root_found
)

echo ❌ ERRO: .git nao encontrado
pause
exit /b 1

:root_found
title FROTA Dev Stack - Starting...
color 0B

cls
echo.
echo ================================================
echo  FROTA - Dev Stack (Backend + Frontend)
echo ================================================
echo.
echo Iniciando 2 servidores...
echo.

REM Abrir Backend em nova janela
echo [1/2] Iniciando Backend em localhost:8000...
start "FROTA Backend" cmd /k "cd /d "%~dp0" && powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-dev-server.ps1" -Port 8000"

timeout /t 3 /nobreak

REM Abrir Frontend em nova janela
echo [2/2] Iniciando Frontend em localhost:3001...
start "FROTA Frontend" cmd /k "cd /d "%~dp0" && powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-frontend-dev.ps1" -Port 3001"

timeout /t 2 /nobreak

cls
echo.
echo ================================================
echo  ✅ STACK INICIADO COM SUCESSO!
echo ================================================
echo.
echo 🚀 Backend:  http://localhost:8000
echo              http://seu-ip:8000 (rede)
echo.
echo ⚛️  Frontend: http://localhost:3001
echo              http://seu-ip:3001 (rede)
echo.
echo 📊 Swagger:  http://localhost:8000/docs
echo.
echo 💡 Dica: Abra uma nova aba para cada serviço
echo.
echo (Feche esta janela quando terminar os testes)
echo.
pause
