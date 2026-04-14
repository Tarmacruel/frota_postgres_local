# 📚 FROTA - Índice de Documentação e Navegação

## 🗺️ Mapa de Documentação

### 🚀 COMEÇAR AQUI

1. **[QUICK_START.md](QUICK_START.md)** ⭐ **[LER PRIMEIRO]**
   - Início rápido em 3 passos
   - Comandos essenciais
   - Links de acesso

2. **[SETUP_SUMMARY.md](SETUP_SUMMARY.md)**
   - Resumo do que foi entregue
   - Problemas resolvidos
   - Status final

---

## 📖 DOCUMENTAÇÃO PRINCIPAL

### Projeto
- **[README.md](README.md)** - Overview do projeto, stack, features, usuários
- **[DEV_SERVER_GUIDE.md](DEV_SERVER_GUIDE.md)** - Modo desenvolvimento em rede

### Configuração
- **[SETUP_REMOTE_INSTRUCTIONS.md](SETUP_REMOTE_INSTRUCTIONS.md)** - Setup com PostgreSQL remoto

### Troubleshooting
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** ⚠️ **[SE DER ERRO, LER AQUI]**
  - PostgreSQL offline
  - Erros de encoding
  - Erros de conexão BD
  - Problemas de migrations
  - Diagnostic commands

- **[HISTORICO_PROBLEMAS.md](HISTORICO_PROBLEMAS.md)**
  - Explicação técnica de cada problema resolvido
  - Antes vs. depois
  - Detalhes de implementação

### Scripts
- **[SCRIPTS_MANIFEST.md](SCRIPTS_MANIFEST.md)** - List de todos scripts com funções

---

## ⚡ SCRIPTS PRINCIPAIS

### 🟢 USE ESTES (Novo Sistema)

```batch
rem 1. Diagnosticar
.\Diagnostico.ps1

rem 2. Se tudo OK, iniciar
.\Iniciar_Stack_Dev.bat

rem 3. Se erro com BD
.\Iniciar_PostgreSQL.bat
```

### 🟡 ALTERNATIVAS

| Para... | Use... |
|---------|--------|
| Backend apenas | `Iniciar_Dev_Server.bat` |
| Frontend apenas | `Iniciar_Frontend_Dev.bat` |
| Parar sistema | `FROTA_Parar.bat` |
| Menu principal | `FROTA_Iniciar.bat` |
| Produção (port 80) | `Publicar_Frota_80.bat` |
| Resetar BD | `Iniciar_PostgreSQL.bat` → opção 3 |

---

## 🔍 POR PROBLEMA

### Problema: PostgreSQL não inicia
👉 **[TROUBLESHOOTING.md#postgres-offline](TROUBLESHOOTING.md)** → Execute `Iniciar_PostgreSQL.bat`

### Problema: Erro de encoding em PowerShell
👉 **[TROUBLESHOOTING.md#encoding](TROUBLESHOOTING.md)** → Scripts já corrigidos

### Problema: TypeError em models
👉 **[HISTORICO_PROBLEMAS.md#problema-2](HISTORICO_PROBLEMAS.md)** → Já resolvido

### Problema: Migrations falhando
👉 **[TROUBLESHOOTING.md#migrations](TROUBLESHOOTING.md)** → Verifique BD

### Problema: Genérico/desconhecido
👉 Execute `.\Diagnostico.ps1` → Verifica tudo

---

## 🎯 FLUXOS COMUNS

### PRIMEIRA VEZ (Máquina nova)

```powershell
# 1. Abrir terminal aqui (Shift+Click na pasta)
# 2. Rodar:
.\Diagnostico.ps1

# 3. Se tudo verde:
.\Iniciar_Stack_Dev.bat

# 4. Acessar:
# http://localhost:3001
```

**📖 Documentação:** QUICK_START.md

---

### DESENVOLVIMENTO DIÁRIO

```powershell
.\Iniciar_Stack_Dev.bat
```

**Pronto!** Backend em :8000, Frontend em :3001

---

### DESENVOLVIMENTO BACKEND SEPARADO

```powershell
cd backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

**📖 Documentação:** README.md → Modo dev separado

---

### DESENVOLVIMENTO FRONTEND SEPARADO

```powershell
cd frontend
npm run dev
```

**📖 Documentação:** README.md → Modo dev separado

---

### GERENCIAR BANCO DE DADOS

```powershell
.\Iniciar_PostgreSQL.bat
# Menu interativo com opções
```

**📖 Documentação:** TROUBLESHOOTING.md

---

### SE SISTEMA TRAVOU

```powershell
# 1. Verificar status
.\Diagnostico.ps1

# 2. Se PostgreSQL offline
.\Iniciar_PostgreSQL.bat

# 3. Se erro persistir
FROTA_Parar.bat
# Aguarde 5 segundos
.\Iniciar_Stack_Dev.bat
```

---

## 📞 REFERÊNCIA RÁPIDA

### Credenciais Padrão
```
BD:       frota_user:frota_secret@127.0.0.1:5432/frota_db
Admin:    admin@frota.local / Admin@1234
Padrão:   padrao@frota.local / User@1234
```

### URLs Importantes
```
Frontend:  http://localhost:3001
Backend:   http://localhost:8000/api
Docs:      http://localhost:8000/docs
ReDoc:     http://localhost:8000/redoc
Health:    http://localhost:8000/api/health
```

### Portas
```
3001  = Frontend (Vite dev)
8000  = Backend (FastAPI)
5432  = PostgreSQL
```

---

## 🔧 TÉCNICO

### Arquitetura
- **Backend:** FastAPI + SQLAlchemy Async + Alembic
- **Frontend:** React + Vite
- **Database:** PostgreSQL 16 local
- **Deploy:** Scripts batch Windows

### Stack Versions
- Python 3.14
- Node.js v24.14
- PostgreSQL 16
- FastAPI 0.115.12
- SQLAlchemy 2.0.38

### Problemas Conhecidos Resolvidos
✅ SQLAlchemy + Python 3.14 incompatibilidade  
✅ Alembic usando SQLite fallback  
✅ PowerShell encoding errors  
✅ PostgreSQL service not running  
✅ Models com type hints incompatíveis

**📖 Detalhes:** HISTORICO_PROBLEMAS.md

---

## 📚 ESTRUTURA DE ARQUIVOS

```
frota_postgres_local/
├── QUICK_START.md              ⭐ [INÍCIO]
├── README.md                   [Overview]
├── SETUP_SUMMARY.md            [Resumo]
├── TROUBLESHOOTING.md          [Erros]
├── HISTORICO_PROBLEMAS.md      [Técnico]
├── SCRIPTS_MANIFEST.md         [Scripts]
├── DEV_SERVER_GUIDE.md         [Dev]
├── SETUP_REMOTE_INSTRUCTIONS.md [Remoto]
│
├── Diagnostico.ps1             ⚡ [USAR 1º]
├── Iniciar_Stack_Dev.bat       ⚡ [INICIAR]
├── Iniciar_PostgreSQL.bat      🗄️  [BD]
│
├── backend/
│   ├── .env                    [Config]
│   ├── requirements.txt        [Deps]
│   ├── alembic/                [Migrations]
│   ├── app/                    [FastAPI]
│   └── .venv/                  [Python env]
│
├── frontend/
│   ├── package.json            [Config]
│   ├── vite.config.js          [Vite]
│   ├── src/                    [React]
│   └── node_modules/           [Node deps]
│
└── scripts/                    [Automação]
    ├── run-dev-server.ps1
    ├── run-frontend-dev.ps1
    └── ops/                    [Menu]
```

---

## ✅ CHECKLIST DE SETUP

- [ ] Ler [QUICK_START.md](QUICK_START.md)
- [ ] Executar `.\Diagnostico.ps1`
- [ ] Executar `.\Iniciar_Stack_Dev.bat`
- [ ] Acessar http://localhost:3001
- [ ] Fazer login com admin@frota.local
- [ ] Testar em http://localhost:8000/docs
- [ ] Se erro, ler [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 🎓 PRÓXIMAS ETAPAS

1. **Testar Sistema**
   - POST /api/auth/login
   - GET /api/vehicles
   - Operações CRUD

2. **Integrar Frontend**
   - Verificar console para erros
   - Testar CORS
   - Validar proxy /api

3. **Validar em Rede**
   - Acessar de outra máquina
   - Usar IP 192.168.18.103
   - Testar conectividade

4. **Produção (Futuro)**
   - Configurar Cloudflare tunnel
   - Setup port 80
   - SSL/HTTPS
   - Backups

---

**Última atualização:** 2024  
**Status:** ✅ Sistema funcional  
**Documentação:** Completa

👉 **PRÓXIMO PASSO:** Abrir [QUICK_START.md](QUICK_START.md)
