@echo off
REM ================================================
REM  FROTA - Start PostgreSQL 16 Local
REM ================================================

title FROTA - PostgreSQL 16

cls
echo.
echo ================================================
echo  FROTA - Starting PostgreSQL 16
echo ================================================
echo.

REM Check if already running
netstat -ano | findstr ":5432" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] PostgreSQL already running on port 5432
    goto :menu
)

echo [*] Starting PostgreSQL 16...
cd /d "C:\Program Files\PostgreSQL\16\bin"

net start PostgreSQL-x64-16
if %ERRORLEVEL% equ 0 (
    echo.
    echo [OK] PostgreSQL started successfully!
) else (
    echo.
    echo [ERR] Failed to start PostgreSQL
    echo Please verify you have administrator permissions
    pause
    exit /b 1
)

:menu
echo.
echo ================================================
echo.
echo PostgreSQL running at: localhost:5432
echo.
echo Options:
echo   1. Apply Database Migrations
echo   2. Check Status
echo   3. Exit
echo.
set /p choice="Choose an option: "

if "%choice%"=="1" (
    cd /d z:\FROTAS\frota_postgres_local\backend
    echo.
    echo [*] Applying migrations...
    .venv\Scripts\python.exe -m alembic upgrade heads
    if %ERRORLEVEL% equ 0 (
        echo.
        echo [OK] Migrations applied successfully!
    ) else (
        echo.
        echo [ERR] Failed to apply migrations
    )
    echo.
    pause
    goto :menu
)

if "%choice%"=="2" (
    echo.
    echo [*] Checking PostgreSQL status...
    netstat -ano | findstr ":5432" >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo [OK] PostgreSQL is running on port 5432
    ) else (
        echo [ERR] PostgreSQL is not running on port 5432
    )
    echo.
    pause
    goto :menu
)

if "%choice%"=="3" (
    exit /b 0
)

echo Invalid option!
pause
goto :menu
