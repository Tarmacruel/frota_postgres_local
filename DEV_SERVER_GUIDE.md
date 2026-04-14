# 🚀 FROTA Dev Server - Network Mode

Scripts para iniciar o FROTA em modo desenvolvimento, acessível de qualquer máquina da rede.

## 📋 Scripts Disponíveis

### 1. `Iniciar_Stack_Dev.bat` ⭐ (RECOMENDADO)
**Inicia Backend + Frontend automaticamente**

```bat
Duplo clique em: Iniciar_Stack_Dev.bat
```

Abre 2 janelas:
- Backend rodando em `:8000`
- Frontend rodando em `:3001`

**Acesso:**
- Local: `http://localhost:8000` e `http://localhost:3001`
- Rede: `http://SEU_IP:8000` e `http://SEU_IP:3001`

---

### 2. `Iniciar_Dev_Server.bat`
**Inicia apenas o Backend**

```bat
Duplo clique em: Iniciar_Dev_Server.bat
```

Exibe seu IP automaticamente para acessar de outras máquinas.

**Acesso:**
```
Local: http://localhost:8000
Rede:  http://{seu-ip}:8000
```

---

### 3. `Iniciar_Frontend_Dev.bat`
**Inicia apenas o Frontend (React + Vite)**

```bat
Duplo clique em: Iniciar_Frontend_Dev.bat
```

Requer Backend rodando em `http://localhost:8000`

**Acesso:**
```
Local: http://localhost:3001
Rede:  http://{seu-ip}:3001
```

---

## 🔧 Pré-requisitos

- [ ] Python 3.10+ (com venv acionado)
- [ ] Node.js v18+ (para frontend)
- [ ] PostgreSQL 16 rodando **em outra máquina** com banco `frota_db` criado
- [ ] `.env` preenchido com DATABASE_URL apontando para PostgreSQL

```env
DATABASE_URL=postgresql+asyncpg://frota_user:frota_secret@{pg-host}:5432/frota_db
```

---

## 🚀 Quick Start

### Primeira vez? Execute o setup:

```bat
Setup_Backend_Remoto.bat
```

Depois inicie:

```bat
Iniciar_Stack_Dev.bat
```

---

## 📍 Descobrir seu IP na rede

**Windows (PowerShell):**
```powershell
(Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object {$_.IPAddress -notlike "127.*"} | Select-Object -First 1).IPAddress
```

**Ou procure na tela do servidor quando rodar um dos .bat**

---

## 🌐 Acessar de Outra Máquina

1. Note o IP da máquina que está rodando o servidor (ex: `192.168.1.100`)
2. Na outra máquina, abra o navegador:
   - Backend: `http://192.168.1.100:8000`
   - Frontend: `http://192.168.1.100:3001`
   - Swagger: `http://192.168.1.100:8000/docs`

---

## 🔗 Endpoints Disponíveis

| Recurso | URL |
|---|---|
| Frontend Web | `http://SEU_IP:3001` |
| API REST | `http://SEU_IP:8000/api` |
| Swagger UI | `http://SEU_IP:8000/docs` |
| ReDoc | `http://SEU_IP:8000/redoc` |
| Health Check | `http://SEU_IP:8000/api/health` |

---

## 📊 Exemplo de Acesso Completo

**Máquina com PostgreSQL (IP: 192.168.1.50)**
- Tem: PostgreSQL 16, banco `frota_db` criado
- URL simples: `http://192.168.1.50:5432` (só para admin)

**Máquina com FROTA (IP: 192.168.1.100)**
- Roda: Backend (:8000) + Frontend (:3001)
- Acesso externo: 
  - Frontend: `http://192.168.1.100:3001`
  - Backend API: `http://192.168.1.100:8000`

---

## ⚙️ Configuração Avançada

### Usar porta diferente

**Backend:**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-dev-server.ps1" -Port 9000
```

**Frontend:**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-frontend-dev.ps1" -Port 3002
```

---

## 🛑 Parar os Servidores

- Pressione `Ctrl+C` na janela do servidor
- Ou feche a janela `cmd`

---

## 🔐 Credenciais Padrão

```
Admin: admin@frota.local / Admin@1234
User: padrao@frota.local / User@1234
```

---

## 📝 Logs

```
Backend logs: backend/storage/logs/
Frontend logs: Console do navegador (F12)
```

---

## ❌ Troubleshooting

### "Porta X já em uso"
```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | % {Get-Process -Id $_.OwningProcess}
```

### "Não consigo acessar de outra máquina"
- Verifique firewall (permita portas 8000 e 3001)
- Use IP ao invés de `localhost`
- Confirme que Backend está rodando: `http://SEU_IP:8000/docs`

### "PostgreSQL connection failed"
- Confirme que PostgreSQL está rodando na máquina remota
- Verifique banco `frota_db` existe
- Teste conexão: `psql -h {pg-host} -U frota_user -d frota_db`

---

**Criado para: Sistema de Frota PMTF**  
**Ambiente:** Desenvolvimento / Testes  
**Produção:** Use scripts específicos de deploy
