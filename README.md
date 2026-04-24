# Sistema de Frota - PMTF

Sistema oficial para gestão da frota da Prefeitura Municipal de Teixeira de Freitas, com backend FastAPI, frontend React e PostgreSQL rodando de forma nativa no Windows, sem Docker e em processo único para publicação no estilo do SIREL.

## Stack

- Backend: FastAPI + SQLAlchemy Async + Alembic
- Frontend: React + Vite + Axios + React Router
- Banco: PostgreSQL 16 local
- Execução: processo Python único servindo API e frontend buildado
- Identidade visual: brasão oficial da PMTF, tema azul royal e relatórios institucionais em PDF e XLSX

## O que o sistema faz

- Autenticação com cookie HttpOnly
- Gestão de usuários com perfis `ADMIN` e `PADRAO`
- Cadastro de veículos com histórico de lotação
- Registro de manutenções com custo, descrição e período
- Registro de posse de veículos por condutor
- Encerramento automático da posse ativa anterior ao iniciar uma nova posse
- Exportação oficial em PDF e XLSX para veículos, usuários, manutenções e condutores
- Layout mobile first com navegação recolhível e leitura facilitada no celular

## Identidade institucional

- Logotipo e favicon: `brasão-pmtf.png`
- Endereco institucional usado na interface e nos relatórios:
  `Avenida Marechal Castelo Branco, 145 - Centro, Teixeira de Freitas - BA, CEP 45995-041`
- CNPJ institucional usado nos relatórios:
  `13.650.403/0001-28`

## Usuários seed

- Admin: `admin@frota.local` / `Admin@1234`
- Padrao: `padrao@frota.local` / `User@1234`

## 🚀 Início rápido

### Primeira execução

```powershell
# 1. Verificar saúde do sistema
.\Diagnostico.ps1

# 2. Se tudo OK, iniciar em 1 clique
.\Iniciar_Stack_Dev.bat

# 3. Acessar
# Frontend:  http://localhost:3001
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/docs
```

### Se houver problemas

```powershell
# Consulte o guia de troubleshooting
.\TROUBLESHOOTING.md

# Ou inicie manualmente PostgreSQL
.\Iniciar_PostgreSQL.bat
# → Escolha opção "1" para executar setup completo (DB + migrations + seed)
```

## 📋 Fluxo local recomendado

Esse é o modo mais leve e mais próximo do SIREL (agora centralizado na **Central Operacional**):

```bat
FROTA_Iniciar.bat
```

Esse atalho abre um menu único para iniciar, parar, resetar, atualizar, aplicar migrations, backup, logs e status, reduzindo manutenção de scripts duplicados.

### Atalhos diretos principais:

| Script | Funcionalidade |
|--------|---|
| `Iniciar_Stack_Dev.bat` | ⚡ **RECOMENDADO** - Inicia backend + frontend |
| `Iniciar_Dev_Server.bat` | Backend único em `http://localhost:8000` |
| `Iniciar_Frontend_Dev.bat` | Frontend único em `http://localhost:3001` |
| `Iniciar_PostgreSQL.bat` | Gerencia PostgreSQL + migrations |
| `Diagnostico.ps1` | Verifica saúde do sistema |
| `Publicar_Frota_80.bat` | Modo publicação na porta `80` |
| `Parar_Frota_Local.bat` | Encerra a execução local |
| `FROTA_Atualizar.bat` | `git pull`, migrations e build frontend |
| `FROTA_Migracoes.bat` | Aplica `alembic upgrade heads` |
| `Backup_Frota_Local.bat` | Backup operacional versionado |
| `Resetar_Frota_Local.bat` | Reset completo do banco + migrations |

> Se a interface continuar com visual antigo, execute novamente `Iniciar_Frota_Local.bat` para forcar novo build do frontend ou rode `npm run dev` em `frontend` para desenvolvimento em tempo real.

## Publicacao em `frota.sirel.com.br`

Para publicar no subdominio institucional:

```bat
Publicar_Frota_80.bat
```

Esse fluxo:

- usa o mesmo PostgreSQL local do host
- builda o frontend
- sobe o **frontend** na porta `80` (Vite com proxy interno)
- sobe a **API backend** separadamente na porta `8000`
- faz bind do frontend em `localhost` para compatibilidade com tunnel Cloudflare
- configura proxy do frontend para `/api` -> `http://localhost:8000`
- ativa configuração de produção (em loopback, `COOKIE_SECURE=false` para permitir login via HTTP local)
- ajusta CORS automaticamente (loopback + domínio institucional quando em `localhost`)

Arquivos de apoio:

- Ambiente base: [backend/.env.example](/z:/FROTAS/frota_postgres_local/backend/.env.example)
- Ambiente de produção: [backend/.env.production.example](/z:/FROTAS/frota_postgres_local/backend/.env.production.example)
- Bootstrap do banco local: [scripts/start_local_postgres.ps1](/z:/FROTAS/frota_postgres_local/scripts/start_local_postgres.ps1)
- Script principal: [scripts/start_frota.ps1](/z:/FROTAS/frota_postgres_local/scripts/start_frota.ps1)

## Banco de dados

O projeto não depende mais de Docker.

O banco padrao roda localmente em:

- Host: `localhost`
- Porta: `5432`
- Banco: `frota_db`
- Usuário: `frota_user`
- Senha: `frota_secret`
- URL padrao: `postgresql+asyncpg://frota_user:frota_secret@localhost:5432/frota_db`

> Se sua instalação usa `postgres` no pgAdmin (como usuário admin), o bootstrap detecta e usa `postgres` automaticamente para criar o banco quando necessário.

O script [scripts/start_local_postgres.ps1](/z:/FROTAS/frota_postgres_local/scripts/start_local_postgres.ps1):

- reutiliza um PostgreSQL ja ativo na porta `5432` (ex.: servico Windows),
- cria role/banco/permissoes quando necessário,
- e, quando o banco `frota_db` for criado do zero, restaura automaticamente o backup mais recente de `storage/backups/frota-backup-*.zip` (arquivo `database.sql`).

Se o cluster gerenciado local ainda não existir (modo `%LOCALAPPDATA%\FrotaPMTF\postgres-data`), o script inicializa automaticamente.

## Acessos

- Aplicacao local: `http://localhost:8000`
- Frontend (dev): `http://localhost:3001` (ou próximo disponível)
- API REST: `http://localhost:8000/api`
- Swagger: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Publicacao: `http://frota.sirel.com.br` ou `https://frota.sirel.com.br`
- Healthcheck: `/api/health`

## Modo dev separado

Frontend com Vite:

```bash
cd frontend
npm install
npm run dev
```

> Se o backend estiver em outra porta (ex.: `80` no publish), crie `frontend/.env.local` com `VITE_API_PROXY_TARGET=http://localhost:80` antes de rodar `npm run dev`.

Backend isolado:

```bash
cd backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

Bootstrap do PostgreSQL (dentro de `backend`, usando wrapper):

```powershell
cd backend
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start_local_postgres.ps1 -Port 5432 -Database frota_db -DbUser frota_user -DbPassword frota_secret -SuperUser frota_user
```

## Areas da aplicacao

- `/` painel operacional
- `/vehicles` cadastro de veículos, lotação e condutor atual
- `/manutencoes` histórico, cadastro e exportação de manutenções
- `/condutores` posse de veículos, encerramento e exportação
- `/users` administração de usuários

## Endpoints principais

### Autenticação

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Veículos

- `GET /api/vehicles`
- `POST /api/vehicles`
- `PUT /api/vehicles/{vehicle_id}`
- `DELETE /api/vehicles/{vehicle_id}`
- `GET /api/vehicles/{vehicle_id}/historico`
- `GET /api/vehicles/{vehicle_id}/current-driver`

### Manutencoes

- `GET /api/maintenance`
- `GET /api/maintenance/{record_id}`
- `POST /api/maintenance`
- `PUT /api/maintenance/{record_id}`
- `DELETE /api/maintenance/{record_id}`

### Posse de veículos

- `GET /api/possession`
- `GET /api/possession/active`
- `POST /api/possession`
- `PUT /api/possession/{possession_id}/end`

## Seed inicial

O seed cria:

- 2 usuários de acesso
- 3 veículos de exemplo
- histórico inicial de lotação
- manutenções de exemplo
- posses de exemplo

## Validação

Build do frontend:

```bash
cd frontend
npm run build
```

Smoke test do backend:

```bash
cd backend
$env:PYTHONPATH = (Get-Location).Path
.venv\Scripts\python.exe -m pytest tests\test_smoke.py -q
```
uvicorn main:app --host 0.0.0.0 --port 8000 --reload


## Operação local (passo a passo)

### 1) Atualizar código e aplicar banco

```powershell
cd Z:\FROTAS\frota_postgres_local
git checkout main
git pull origin main
Setup_PostgreSQL_Local.bat
```

O `Setup_PostgreSQL_Local.bat` agora:
1. garante o PostgreSQL local em `localhost:5432`,
2. configura banco/credenciais,
3. restaura o backup mais recente se o banco for criado do zero,
4. aplica `alembic upgrade heads`,
5. executa `scripts/seed.py`.

### 2) Build do frontend para publicação local (porta 80)

```powershell
cd Z:\FROTAS\frota_postgres_local\frontend
npm install
npm run build
```

### 3) Subir ambiente completo para publicação local

```powershell
cd Z:\FROTAS\frota_postgres_local
Publicar_Frota_80.bat
```

### 4) Modo desenvolvimento (hot reload)

Backend:

```powershell
cd Z:\FROTAS\frota_postgres_local\backend
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd Z:\FROTAS\frota_postgres_local\frontend
npm run dev
```

## Parar processos e liberar portas

### Encerrar rapidamente app local (atalho)

```bat
Parar_Frota_Local.bat
```

### Descobrir e matar processo da porta 80 (PowerShell Admin)

```powershell
$pid80 = (Get-NetTCPConnection -LocalPort 80 -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess)
Get-Process -Id $pid80
Stop-Process -Id $pid80 -Force
```

Validação:

```powershell
Get-NetTCPConnection -LocalPort 80 -State Listen
```

Se não retornar nada, a porta 80 está livre.

## Rotina recomendada quando frontend não atualiza

1. Parar o processo antigo (`Parar_Frota_Local.bat` ou `Stop-Process` da porta 80).
2. Rodar novo build do frontend (`npm run build` em `frontend`).
3. Subir novamente com `Publicar_Frota_80.bat`.
4. Fazer `Ctrl+F5` no navegador e testar em aba anônima.
5. Se usar Cloudflare Tunnel, limpar cache do Cloudflare e reiniciar o tunnel se necessário.

## Scripts utilitarios

- `Iniciar_Frota_Local.bat`: sobe stack local e builda frontend.
- `Publicar_Frota_80.bat`: publica em modo produção na porta 80.
- `Parar_Frota_Local.bat`: encerra processos locais (8000, 5173 e 80).
- `Backup_Frota_Local.bat`: gera backup SQL versionado em `storage/backups`.
- `Setup_PostgreSQL_Local.bat`: garante PostgreSQL local, aplica migrations e seed.
- `Resetar_Frota_Local.bat`: reseta schema `public` e reaplica migrations.

## Observacoes

- O frontend não grava token em `localStorage`
- A raiz `/` entrega o frontend buildado quando `frontend/dist` existe
- A API continua disponivel em `/api/*`
- A posse ativa é encerrada automaticamente ao iniciar uma nova para o mesmo veículo
- A exclusão de veículo remove histórico, manutenções e posse vinculados por `ON DELETE CASCADE`
- O Cloudflare aceita proxy HTTP nas portas `80`, `8080`, `8880`, `2052`, `2082`, `2086` e `2095`
- O Cloudflare aceita proxy HTTPS nas portas `443`, `2053`, `2083`, `2087`, `2096` e `8443`
