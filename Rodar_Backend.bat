@echo off
REM ============================================
REM  FROTA - Run Backend Server
REM ============================================
cd /d "%~dp0backend"

title FROTA Backend Server - Listening on :8000
color 0A

echo.
echo ===============================================
echo  FROTA Backend - FastAPI Server
echo ===============================================
echo.
echo URL: http://localhost:8000
echo Swagger: http://localhost:8000/docs
echo.
echo (Press Ctrl+C to stop)
echo.

.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload

pause
