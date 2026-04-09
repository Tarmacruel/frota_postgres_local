# Sistema de Frota - PMTF

Projeto para gerenciamento local da frota municipal com FastAPI, React e PostgreSQL.

## Stack

- Backend: FastAPI + SQLAlchemy Async + Alembic
- Frontend: React + Vite + Axios + React Router
- Banco: PostgreSQL
- Infra local: Docker Compose

## Funcionalidades

- Autenticacao com cookie HttpOnly
- Gestao de usuarios com perfis `ADMIN` e `PADRAO`
- Cadastro de veiculos com historico de lotacao
- Registro de manutencoes com custo, descricao e status em andamento ou concluido
- Registro de posse de veiculos por condutor
- Encerramento automatico da posse ativa anterior ao iniciar uma nova posse
- Dashboard com indicadores de frota, manutencoes abertas e condutores ativos

## Usuarios seed

- Admin: `admin@frota.local` / `Admin@1234`
- Padrao: `padrao@frota.local` / `User@1234`

## Subir com Docker

```bash
docker compose up -d --build
```

O `backend` executa automaticamente:

- `alembic upgrade head`
- `python -m scripts.seed`
- `uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload`

## Acessos

- Frontend: http://localhost:5175
- Backend: http://localhost:8001
- Swagger: http://localhost:8001/docs

## Areas da aplicacao

- `/` painel com indicadores operacionais
- `/vehicles` cadastro de veiculos, lotacao e condutor atual
- `/manutencoes` historico e cadastro de manutencoes
- `/condutores` posse de veiculos e historico de condutores
- `/users` administracao de usuarios

## Seed inicial

O seed cria:

- 2 usuarios padrao de acesso
- 3 veiculos de exemplo
- historico inicial de lotacao
- manutencoes de exemplo
- posses de exemplo

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

## Rodar sem Docker

### Backend

```bash
cd backend
python -m venv .venv

# Linux/macOS
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1

pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8001
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Testes e validacao

Frontend:

```bash
cd frontend
npm run build
```

Backend:

```bash
docker compose exec backend sh -lc "PYTHONPATH=/app pytest tests/test_smoke.py -q"
```

## Observacoes

- O frontend nao grava token no `localStorage`
- A lotacao ativa e encerrada antes da criacao de um novo registro
- A posse ativa e encerrada automaticamente ao iniciar uma nova posse para o mesmo veiculo
- A exclusao de veiculo remove historico, manutencoes e posse vinculados por `ON DELETE CASCADE`
