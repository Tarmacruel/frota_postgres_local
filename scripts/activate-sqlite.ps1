# Switch to SQLite mode for quick testing
# Copy .env.sqlite to .env
Write-Host "Ativando modo SQLite..." -ForegroundColor Yellow
Copy-Item z:\FROTAS\frota_postgres_local\backend\.env.sqlite z:\FROTAS\frota_postgres_local\backend\.env -Force

# Run migrations
cd z:\FROTAS\frota_postgres_local\backend
Write-Host "Aplicando migrations no SQLite..." -ForegroundColor Cyan
.\.venv\Scripts\alembic.exe upgrade heads

# Seed demo data
Write-Host "Carregando seed data..." -ForegroundColor Cyan
.\.venv\Scripts\python.exe scripts/seed.py

Write-Host "✅ SQLite pronto! Backend pode rodar." -ForegroundColor Green
