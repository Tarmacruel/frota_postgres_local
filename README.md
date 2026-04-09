# Sistema de Frota - PMTF

Projeto para gerenciamento da frota municipal com FastAPI, React e PostgreSQL, agora preparado para rodar em modo leve no Windows, com frontend buildado e servido pelo proprio backend.

## Stack

- Backend: FastAPI + SQLAlchemy Async + Alembic
- Frontend: React + Vite + Axios + React Router
- Banco: PostgreSQL
- Execucao local: processo Python unico, no estilo do SIREL
- Docker: opcional, apenas para o banco

## O que o sistema faz

- Autenticacao com cookie HttpOnly
- Gestao de usuarios com perfis `ADMIN` e `PADRAO`
- Cadastro de veiculos com historico de lotacao
- Registro de manutencoes com custo, descricao e status
- Registro de posse de veiculos por condutor
- Encerramento automatico da posse ativa anterior ao iniciar uma nova posse
- Dashboard operacional com indicadores de frota
- Layout mobile first com navegacao recolhivel e tabelas empilhadas no celular

## Usuarios seed

- Admin: `admin@frota.local` / `Admin@1234`
- Padrao: `padrao@frota.local` / `User@1234`

## Fluxo recomendado local

Esse e o modo mais leve e mais proximo do SIREL:

1. Suba apenas o PostgreSQL, se precisar:

```bash
docker compose up -d postgres
```

2. Inicie a aplicacao completa em porta unica:

```bat
Iniciar_Frota_Local.bat
```

Esse atalho:

- cria o `backend\.venv` em Python 3.12 quando necessario
- instala dependencias
- builda o frontend
- aplica migrations
- executa seed demo
- sobe o FastAPI servindo o frontend junto

## Acessos locais

- Aplicacao: `http://localhost:8000`
- Healthcheck: `http://localhost:8000/api/health`
- Swagger: `http://localhost:8000/docs`
- Redoc: `http://localhost:8000/redoc`

## Publicacao para `frota.sirel.com.br`

O projeto esta pronto para ser publicado no mesmo estilo do SIREL: um unico processo web exposto no host.

1. Ajuste o ambiente de producao com base em [backend/.env.production.example](/z:/FROTAS/frota_postgres_local/backend/.env.production.example)
2. Garanta que `frota.sirel.com.br` aponte para o host correto
3. Inicie a aplicacao na porta 80:

```bat
Publicar_Frota_80.bat
```

Observacoes importantes:

- O Cloudflare aceita proxy HTTP nas portas `80`, `8080`, `8880`, `2052`, `2082`, `2086` e `2095`
- O Cloudflare aceita proxy HTTPS nas portas `443`, `2053`, `2083`, `2087`, `2096` e `8443`
- Para `https://frota.sirel.com.br` sem porta na URL, a opcao mais limpa e deixar a origem ouvindo em `80` ou `443`
- Neste host, a porta `80` ficou validada localmente com a aplicacao respondendo

Referencia oficial:

- Cloudflare network ports: https://developers.cloudflare.com/fundamentals/reference/network-ports/

## Banco de dados

O `docker-compose.yml` foi simplificado para manter apenas o PostgreSQL:

```bash
docker compose up -d postgres
```

Porta padrao do container local:

- `127.0.0.1:5433 -> 5432`

Se preferir usar um PostgreSQL ja instalado no Windows, basta ajustar `DATABASE_URL` em `backend/.env`.

O projeto aceita URLs com `asyncpg` ou `psycopg`.

## Modo dev separado

Se quiser mexer no frontend com Vite separado:

```bash
cd frontend
npm install
npm run dev
```

O Vite faz proxy automatico para a API local.

Para subir so o backend nesse fluxo:

```bash
cd backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Areas da aplicacao

- `/` painel operacional
- `/vehicles` cadastro de veiculos, lotacao e condutor atual
- `/manutencoes` historico e cadastro de manutencoes
- `/condutores` posse de veiculos e historico de condutores
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
