# 🔧 FROTA - Guia de Troubleshooting

## ❌ Problemas Encontrados e Soluções

### 1. **PostgreSQL não está rodando**
**Erro:** `asyncpg.exceptions.ConnectionDoesNotExistError: connection was closed in the middle of operation`

**Solução:**
```powershell
# Opção 1: Usar o script de inicialização (RECOMENDADO)
.\Iniciar_PostgreSQL.bat

# Opção 2: Iniciar manualmente
net start PostgreSQL-x64-16

# Verificar se está rodando
netstat -ano | findstr ":5432"
```

**Verificar status:**
```powershell
Get-Service PostgreSQL* | Select-Object Name, Status
```

---

### 2. **Erros de encoding em scripts PowerShell**
**Erro:** `A cadeia de caracteres não tem o terminador`

**Causa:** Emojis (⏹️, 🌐, 📍) em scripts PowerShell com encoding UTF-16LE

**Solução:** Scripts foram corrigidos para usar apenas ASCII:
- ✅ `run-frontend-dev.ps1` - Corrigido
- ✅ `run-dev-server.ps1` - Corrigido
- ✅ `Iniciar_Stack_Dev.bat` - Usar para iniciar ambos

---

### 3. **TypeError ao aplicar migrations (Alembic)**
**Erro anterior (RESOLVIDO):**
```
TypeError: descriptor '__getitem__' requires a 'typing.Union' object but received a 'tuple'
```

**Solução aplicada:**
- Removidos `Mapped[Optional[...]]` de colunas nullable
- Modelos refatorados para compatibilidade com SQLAlchemy 2.0.38 + Python 3.14

---

## ✅ Checklist de Setup

Antes de iniciar o sistema, execute em ordem:

```powershell
# 1. Iniciar PostgreSQL
.\Iniciar_PostgreSQL.bat
  → Escolher opção "1" para aplicar migrations

# 2. Verificar conexão ao banco
# (migrations serão aplicadas na opção 1)

# 3. Iniciar o stack de desenvolvimento
.\Iniciar_Stack_Dev.bat

# 4. Verificar acesso
# Frontend:  http://localhost:3001
# Backend:   http://localhost:8000
# Docs:      http://localhost:8000/docs
```

---

## 🚨 Se algo der errado

### Backend não inicia
```powershell
cd backend
.venv\Scripts\python.exe app/main.py
# Procurar por erro de importação
```

### Frontend não inicia
```powershell
cd frontend
npm install  # Se faltarem dependências
npm run dev
```

### Migrations falhando
```powershell
cd backend
# Verificar se PostgreSQL está rodando
psql -U frota_user -d postgres -c "SELECT 1"

# Se der erro de senha, resetar:
# psql -U postgres
# ALTER USER frota_user PASSWORD 'frota_secret';
```

---

## 📋 Credenciais Padrão

```
Database:  frota_db
User:      frota_user
Password:  frota_secret
Host:      127.0.0.1
Port:      5432
```

---

## 🔍 Diagnostic Commands

```powershell
# Verificar PostgreSQL
netstat -ano | findstr ":5432"
Get-Process postgres* -ErrorAction SilentlyContinue

# Verificar portas do sistema
netstat -ano | findstr ":3000"  # Frontend (dev)
netstat -ano | findstr ":3001"  # Frontend (prod)
netstat -ano | findstr ":8000"  # Backend

# Testar conexão ao banco
$env:PGPASSWORD="frota_secret"
psql -h 127.0.0.1 -U frota_user -d frota_db -c "SELECT version();"
```

---

## 📞 Próximos Passos

1. Execute `Iniciar_PostgreSQL.bat`
2. Execute `Iniciar_Stack_Dev.bat`
3. Acesse http://localhost:3001
4. Verifique logs para erros

Se persistir erro de conexão, verifique:
- ✓ PostgreSQL está rodando? (`netstat -ano | findstr :5432`)
- ✓ Arquivo `.env` na raiz do projeto existe?
- ✓ DATABASE_URL correto? (`postgresql+asyncpg://frota_user:frota_secret@127.0.0.1:5432/frota_db`)
