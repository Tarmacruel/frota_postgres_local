# Setup Backend em Máquina com PostgreSQL 16

## 📁 Pré-requisitos

- [ ] Python 3.10+ instalado
- [ ] PostgreSQL 16 rodando localmente (ou acesso remoto confirmado)
- [ ] Git para clonar o repositório

## 🚀 Passos

### 1️⃣ Clone o repositório

```bash
git clone <repo-url>
cd frota_postgres_local
```

### 2️⃣ Execute o setup automático

**Opção A - Interativo (recomendado):**
```bash
Setup_Backend_Remoto.bat
```

Vai solicitar:
- IP/hostname do PostgreSQL
- Porta (padrão 5432)

**Opção B - Linha de comando:**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-remote-backend.ps1" -PostgresHost "localhost" -PostgresPort 5432
```

### 3️⃣ Verifique o .env

Arquivo criado em: `backend/.env`

```env
DATABASE_URL=postgresql+asyncpg://frota_user:frota_secret@localhost:5432/frota_db
SECRET_KEY=...
CORS_ORIGINS=[...]
```

Ajuste conforme necessário.

### 4️⃣ Inicie o Backend

**Opção A - .bat (Windows):**
```bash
Rodar_Backend.bat
```

**Opção B - PowerShell:**
```powershell
cd backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Opção C - CMD:**
```cmd
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 5️⃣ Teste a conexão

- Swagger: http://localhost:8000/docs
- API Health: http://localhost:8000/api/health
- ReDoc: http://localhost:8000/redoc

## 🔧 Troubleshooting

### "PostgreSQL connection failed"
- Verifique se PostgreSQL está rodando: `pg_isready -h localhost -p 5432`
- Veja se usuário `frota_user` existe e tem permissão
- Confirme que banco `frota_db` foi criado

### "ModuleNotFoundError"
```powershell
cd backend
.venv\Scripts\pip.exe install -r requirements.txt
```

### Porta 8000 já em uso
```powershell
# Encontre qual processo está usando
Get-NetTCPConnection -LocalPort 8000 -State Listen | % {Get-Process -Id $_.OwningProcess}

# Use outra porta
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8001 --reload
```

## 📊 Informações de Conexão

| Componente | Valor |
|---|---|
| Backend URL | `http://localhost:8000` |
| API Endpoint | `http://localhost:8000/api` |
| Swagger UI | `http://localhost:8000/docs` |
| Database | PostgreSQL 16 |
| Port | 8000 |

## 🔐 Credenciais Padrão

- Admin: `admin@frota.local` / `Admin@1234`
- User: `padrao@frota.local` / `User@1234`

## 📝 Logs

Logs de erro: `storage/logs/frota-app.error.log`
Logs gerais: `storage/logs/frota-app.log`

---

**Se houver dúvidas, verifique o README.md do projeto.**
