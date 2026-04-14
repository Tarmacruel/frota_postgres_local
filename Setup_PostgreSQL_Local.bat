@echo off
REM ================================================
REM  FROTA - Setup Local PostgreSQL
REM  Aplica migrations e corrige permissoes
REM ================================================

cd /d "%~dp0"

title FROTA - Setup PostgreSQL Local
color 0A

cls
echo.
echo ================================================
echo  FROTA - Setup PostgreSQL 16 (Local)
echo ================================================
echo.
echo Aplicando migrations ao banco local...
echo.

echo [0] Garantindo PostgreSQL local em 127.0.0.1:5432...
if "%PG_SUPER_PASSWORD%"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_local_postgres.ps1" -Port 5432 -Database frota_db -DbUser postgres -DbPassword postgres -SuperUser postgres -SuperPassword postgres
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start_local_postgres.ps1" -Port 5432 -Database frota_db -DbUser postgres -DbPassword postgres -SuperUser postgres -SuperPassword "%PG_SUPER_PASSWORD%"
)
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERRO] Nao foi possivel iniciar/verificar o PostgreSQL local.
    echo Revise a instalacao do PostgreSQL e tente novamente.
    pause
    exit /b 1
)
echo.

cd backend

REM Definir variavel de ambiente para o banco local
set DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/frota_db

REM Rodar alembic
echo [1] Aplicando migrations (alembic upgrade heads)...
.venv\Scripts\python.exe -m alembic upgrade heads

if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] Migrations aplicadas com sucesso!
) else (
    echo.
    echo [AVISO] Erro ao aplicar migrations
    echo Tente executar manualmente:
    echo   cd backend
    echo   .venv\Scripts\python.exe -m alembic upgrade heads
)

echo.
echo [2] Carregando seed data...
.venv\Scripts\python.exe scripts/seed.py

if %ERRORLEVEL% equ 0 (
    echo [OK] Seed data carregada!
) else (
    echo [AVISO] Erro ao carregar seed
)

echo.
echo ================================================
echo  ✓ Setup Completo!
echo ================================================
echo.
echo Pronto para iniciar o backend:
echo.
echo   Iniciar_Dev_Server.bat
echo.
echo ou
echo.
echo   Iniciar_Stack_Dev.bat
echo.

pause
