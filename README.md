# Sistema de Frota - PMTF (Local + PostgreSQL)

Projeto completo para rodar localmente fora do Emergent.

## Stack
- Backend: FastAPI + SQLAlchemy Async + Alembic + PostgreSQL
- Frontend: React + Vite + Axios + React Router
- Infra: Docker Compose

## Usuários seed
- Admin: `admin@frota.local` / `Admin@1234`
- Padrão: `padrao@frota.local` / `User@1234`

## Subir com Docker
```bash
docker compose up -d --build
```

Acessos:
- Frontend: http://localhost:5175
- Backend: http://localhost:8001
- Docs: http://localhost:8001/docs

## Primeiro uso
```bash
# aplicar migrations
cd backend
alembic upgrade head

# rodar seed
python -m scripts.seed
```

## Sem Docker
### Backend
```bash
cd backend
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows
# .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## Observações
- Autenticação usa cookie HttpOnly (`access_token`).
- O frontend não grava token no `localStorage`.
- A alteração de lotação encerra o histórico ativo e cria novo registro na mesma transação.
- A exclusão de veículo remove o histórico por `ON DELETE CASCADE`.
