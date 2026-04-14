# ⚡ FROTA - Quick Reference Card

## 🚀 INICIAR SISTEMA (1 clique)

```batch
.\Iniciar_Stack_Dev.bat
```

**Resultado:**
- Backend rodando em: http://localhost:8000
- Frontend rodando em: http://localhost:3001  
- Banco de dados: PostgreSQL :5432 ✅

---

## 🔍 VERIFICAR PROBLEMAS

```powershell
.\Diagnostico.ps1
```

**Verifica:**
- ✓ PostgreSQL status
- ✓ Portas abertas
- ✓ Python/Node.js instalado
- ✓ Arquivos de config
- ✓ Conexão ao BD

---

## 🗄️ GERENCIAR BANCO DE DADOS

```batch
.\Iniciar_PostgreSQL.bat
```

**Menu de opções:**
1. Aplicar migrations (primeira vez)
2. Apenas verificar status
3. Resetar banco completamente

---

## 📖 DOCUMENTAÇÃO

| Arquivo | Conteúdo |
|---------|----------|
| **README.md** | Documentação principal |
| **TROUBLESHOOTING.md** | Erros e soluções |
| **HISTORICO_PROBLEMAS.md** | Como foram resolvidos |
| **SETUP_SUMMARY.md** | Resumo geral |
| **SCRIPTS_MANIFEST.md** | Lista de scripts |

---

## 🔗 ACESSOS PRINCIPAIS

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| API Backend | http://localhost:8000/api |
| Swagger Docs | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |

---

## 🔐 LOGIN

```
Email:    admin@frota.local
Senha:    Admin@1234
```

---

## ⚙️ SCRIPTS ÚTEIS

| Script | Função |
|--------|--------|
| `Iniciar_Stack_Dev.bat` | Backend + Frontend |
| `Iniciar_Dev_Server.bat` | Backend apenas |
| `Iniciar_Frontend_Dev.bat` | Frontend apenas |
| `FROTA_Parar.bat` | Parar sistema |
| `Diagnostico.ps1` | Verificar saúde |

---

## ❌ SE ALGO DER ERRADO

```powershell
# 1. Rodar diagnóstico
.\Diagnostico.ps1

# 2. Se PostgreSQL offline:
.\Iniciar_PostgreSQL.bat

# 3. Consultar troubleshooting:
notepad TROUBLESHOOTING.md

# 4. Revisar resoluções:
notepad HISTORICO_PROBLEMAS.md
```

---

## 📋 CREDENCIAIS BD

```
Host:     127.0.0.1
Port:     5432
Database: frota_db
User:     frota_user
Password: frota_secret
```

---

## 🎯 PRÓXIMOS PASSOS

- [ ] `.\Diagnostico.ps1` - Verificar saúde
- [ ] `.\Iniciar_Stack_Dev.bat` - Iniciar sistema
- [ ] http://localhost:3001 - Acessar frontend
- [ ] Login com `admin@frota.local` / `Admin@1234`
- [ ] Testar endpoints em http://localhost:8000/docs

---

**Tudo pronto! 🚀**
