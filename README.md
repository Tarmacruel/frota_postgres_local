# Sistema de Frota - PMTF

Sistema oficial para gestao da frota da Prefeitura Municipal de Teixeira de Freitas, com backend FastAPI, frontend React e PostgreSQL rodando de forma nativa no Windows, sem Docker e em processo unico para publicacao no estilo do SIREL.

## Stack

- Backend: FastAPI + SQLAlchemy Async + Alembic
- Frontend: React + Vite + Axios + React Router
- Banco: PostgreSQL 16 local
- Execucao: processo Python unico servindo API e frontend buildado
- Identidade visual: brasao oficial da PMTF, tema azul royal e relatorios institucionais em PDF e XLSX

## O que o sistema faz

- Autenticacao com cookie HttpOnly
- Gestao de usuarios com perfis `ADMIN` e `PADRAO`
- Cadastro de veiculos com historico de lotacao
- Registro de manutencoes com custo, descricao e periodo
- Registro de posse de veiculos por condutor
- Encerramento automatico da posse ativa anterior ao iniciar uma nova posse
- Exportacao oficial em PDF e XLSX para veiculos, usuarios, manutencoes e condutores
- Layout mobile first com navegacao recolhivel e leitura facilitada no celular

## Identidade institucional

- Logotipo e favicon: `brasao-pmtf.png`
- Endereco institucional usado na interface e nos relatorios:
  `Avenida Marechal Castelo Branco, 145 - Centro, Teixeira de Freitas - BA, CEP 45995-041`
- CNPJ institucional usado nos relatorios:
  `13.650.403/0001-28`

## Usuarios seed

- Admin: `admin@frota.local` / `Admin@1234`
- Padrao: `padrao@frota.local` / `User@1234`

## Fluxo local recomendado

Esse e o modo mais leve e mais proximo do SIREL:

```bat
Iniciar_Frota_Local.bat
```

Esse atalho:

- cria o `backend\.venv` quando necessario
- instala dependencias Python
- sobe um PostgreSQL local em `127.0.0.1:5434`
- instala dependencias do frontend quando necessario
- builda o frontend
- aplica migrations
- executa seed demo
- sobe o FastAPI servindo a aplicacao completa em `http://localhost:8000`

## Publicacao em `frota.sirel.com.br`

Para publicar no subdominio institucional:

```bat
Publicar_Frota_80.bat
```

Esse fluxo:

- usa o mesmo PostgreSQL local do host
- builda o frontend
- sobe a aplicacao na porta `80`
- ativa configuracao de producao com `COOKIE_SECURE=true`
- restringe CORS ao subdominio institucional

Arquivos de apoio:

- Ambiente base: [backend/.env.example](/z:/FROTAS/frota_postgres_local/backend/.env.example)
- Ambiente de producao: [backend/.env.production.example](/z:/FROTAS/frota_postgres_local/backend/.env.production.example)
- Bootstrap do banco local: [scripts/start_local_postgres.ps1](/z:/FROTAS/frota_postgres_local/scripts/start_local_postgres.ps1)
- Script principal: [scripts/start_frota.ps1](/z:/FROTAS/frota_postgres_local/scripts/start_frota.ps1)

## Banco de dados

O projeto nao depende mais de Docker.

O banco padrao roda localmente em:

- Host: `127.0.0.1`
- Porta: `5434`
- Banco: `frota_db`
- Usuario: `frota_user`

Se o cluster ainda nao existir, o script [scripts/start_local_postgres.ps1](/z:/FROTAS/frota_postgres_local/scripts/start_local_postgres.ps1) cria e inicializa tudo automaticamente em `%LOCALAPPDATA%\FrotaPMTF\postgres-data`.

## Acessos

- Aplicacao local: `http://localhost:8000`
- Publicacao: `http://frota.sirel.com.br` ou `https://frota.sirel.com.br`
- Healthcheck: `/api/health`
- Swagger: `/docs`
- Redoc: `/redoc`

## Modo dev separado

Frontend com Vite:

```bash
cd frontend
npm install
npm run dev
```

Backend isolado:

```bash
cd backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Areas da aplicacao

- `/` painel operacional
- `/vehicles` cadastro de veiculos, lotacao e condutor atual
- `/manutencoes` historico, cadastro e exportacao de manutencoes
- `/condutores` posse de veiculos, encerramento e exportacao
- `/users` administracao de usuarios

## Endpoints principais

### Autenticacao

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Veiculos

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

### Posse de veiculos

- `GET /api/possession`
- `GET /api/possession/active`
- `POST /api/possession`
- `PUT /api/possession/{possession_id}/end`

## Seed inicial

O seed cria:

- 2 usuarios de acesso
- 3 veiculos de exemplo
- historico inicial de lotacao
- manutencoes de exemplo
- posses de exemplo

## Validacao

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

## Observacoes

- O frontend nao grava token em `localStorage`
- A raiz `/` entrega o frontend buildado quando `frontend/dist` existe
- A API continua disponivel em `/api/*`
- A posse ativa e encerrada automaticamente ao iniciar uma nova para o mesmo veiculo
- A exclusao de veiculo remove historico, manutencoes e posse vinculados por `ON DELETE CASCADE`
- O Cloudflare aceita proxy HTTP nas portas `80`, `8080`, `8880`, `2052`, `2082`, `2086` e `2095`
- O Cloudflare aceita proxy HTTPS nas portas `443`, `2053`, `2083`, `2087`, `2096` e `8443`
