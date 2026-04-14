# 📋 Scripts do FROTA - Organizados e Atualizados

## 🚀 SCRIPTS PRINCIPAIS (Start Here)

| Script | Descrição | Atalho |
|---|---|---|
| **Diagnostico.ps1** | ✅ Verifica saúde do sistema antes de iniciar | `powershell .\Diagnostico.ps1` |
| **Iniciar_Stack_Dev.bat** | ⭐ Inicia Backend + Frontend (recomendado) | Duplo clique |
| **Iniciar_PostgreSQL.bat** | 🗄️ Gerencia PostgreSQL + migrations | Duplo clique |
| **TROUBLESHOOTING.md** | 📖 Guia de erros e soluções | Abrir arquivo |
| **HISTORICO_PROBLEMAS.md** | 📜 Log de problemas resolvidos nesta sessão | Abrir arquivo |

---

## ✅ Scripts MANTIDOS (Novos / Atualizados)

### Na raiz do repo:

| Script | Função | Uso |
|---|---|---|
| **FROTA_Iniciar.bat** | ⭐ Menu interativo principal | Duplo clique |
| **FROTA_Parar.bat** | Encerra backend (porta 8000) | Duplo clique |
| **Publicar_Frota_80.bat** | Modo produção (porta 80) | Futuro deploy |
| **Setup_Backend_Remoto.bat** | Setup com PostgreSQL remoto | Primeira execução |
| **Rodar_Backend.bat** | Inicia backend simples | Alternativa rápida |
| **Iniciar_Dev_Server.bat** | Backend em modo dev (rede) | Testes |
| **Iniciar_Frontend_Dev.bat** | Frontend em modo dev (rede) | Testes |
| **Iniciar_Stack_Dev.bat** | ⭐ Backend + Frontend juntos | **👈 USE ESTE** |
| **Iniciar_PostgreSQL.bat** | 🗄️ Gerencia PostgreSQL + migrations | **👈 USE ESTE** |
| **Diagnostico.ps1** | ✅ Verifica saúde do sistema | **👈 USE ESTE PRIMEIRO** |
| **Limpar_Scripts_Antigos.bat** | Remove scripts antigos | Limpeza |

### Em scripts/:

| Script | Função |
|---|---|
| **run-dev-server.ps1** | Backend dev (PowerShell) |
| **run-frontend-dev.ps1** | Frontend dev (PowerShell) |
| **setup-remote-backend.ps1** | Setup automatizado (PowerShell) |
| **ops/** | Menu system (MANTER COMO ESTÁ) |

### Documentação:

| Arquivo | Propósito |
|---|---|
| **README.md** | Documentação principal do projeto |
| **DEV_SERVER_GUIDE.md** | Guia de dev server em rede |
| **SETUP_REMOTE_INSTRUCTIONS.md** | Setup detalhado para PostgreSQL remoto |
| **TROUBLESHOOTING.md** | Erros comuns e soluções |
| **HISTORICO_PROBLEMAS.md** | Problemas resolvidos nesta sessão |

---

## ❌ Scripts REMOVIDOS (Antigos / Substituídos)

### .bat removidos:
- ~~Backup_Frota_Local.bat~~ → Use backup em cloud/manual
- ~~Iniciar_Frota_Local.bat~~ → Use Iniciar_Stack_Dev.bat
- ~~Parar_Frota_Local.bat~~ → Use FROTA_Parar.bat
- ~~Resetar_Frota_Local.bat~~ → Manual ou use migrations
- ~~FROTA_Atualizar.bat~~ → Use git pull + Setup
- ~~FROTA_Backup.bat~~ → Use backup manual
- ~~FROTA_Migracoes.bat~~ → Setup faz isso
- ~~FROTA_Resetar.bat~~ → Manual
- ~~FROTA_Status.bat~~ → Verifique em cmd

### .ps1 removidos em scripts/:
- ~~activate-sqlite.ps1~~ → SQLite não será usado em produção
- ~~backup-local.ps1~~ → Backup manual ou cloud
- ~~backup_frota.ps1~~ → Idem
- ~~reset_frota.ps1~~ → Manual conforme necessário
- ~~run-local.ps1~~ → Substituído por run-dev-server.ps1
- ~~run_frota_production.cmd~~ → Substituído por Publicar_Frota_80.bat
- ~~run_frota_production.ps1~~ → Idem
- ~~start_frota.ps1~~ → Substituído por run-dev-server.ps1
- ~~start_local_postgres.ps1~~ → PostgreSQL em outra máquina
- ~~stop_frota.ps1~~ → Substituído por FROTA_Parar.bat

---

## 🚀 Quick Start Após Limpeza

### Primeira execução:
```bat
Setup_Backend_Remoto.bat
```
Responda: IP PostgreSQL + Porta

### Rodar normalmente:
```bat
Iniciar_Stack_Dev.bat
```

### Em produção (depois):
```bat
Publicar_Frota_80.bat
```

---

## 📊 Estrutura Final

```
z:\FROTAS\frota_postgres_local\
├── FROTA_Iniciar.bat ..................... [Menu]
├── FROTA_Parar.bat ....................... [Stop]
├── Publicar_Frota_80.bat ................. [Produção]
├── Setup_Backend_Remoto.bat .............. [Setup]
├── Rodar_Backend.bat ..................... [Backend simples]
├── Iniciar_Dev_Server.bat ................ [Backend dev]
├── Iniciar_Frontend_Dev.bat .............. [Frontend dev]
├── Iniciar_Stack_Dev.bat ................. [Stack dev] ⭐
├── Limpar_Scripts_Antigos.bat ............ [Cleanup]
│
├── scripts/
│   ├── run-dev-server.ps1 ................ [Backend PS1]
│   ├── run-frontend-dev.ps1 .............. [Frontend PS1]
│   ├── setup-remote-backend.ps1 ......... [Setup PS1]
│   └── ops/ ............................. [Menu system]
│
├── backend/ ............................. [FastAPI]
├── frontend/ ............................ [React]
│
├── README.md ............................ [Principal]
├── DEV_SERVER_GUIDE.md .................. [Dev servers]
├── SETUP_REMOTE_INSTRUCTIONS.md ......... [Setup]
```

---

## 💡 Regra: O que Remover, O que Manter

| Situação | Ação |
|---|---|
| Script muito antigo | ❌ Remova |
| Script duplicado | ❌ Remova (manter só o melhor) |
| Script não documentado | ❌ Suspeite, pergunte |
| Script crítico mas antigo | ⚠️ Refatore/Reescreva |
| Script novo e testado | ✅ Mantenha |
| Script com bom .md explicando | ✅ Mantenha |

---

**Para limpar automaticamente:**
```bat
Limpar_Scripts_Antigos.bat
```

**Para restaurar (git):**
```bash
git checkout <deleted-file>
```
