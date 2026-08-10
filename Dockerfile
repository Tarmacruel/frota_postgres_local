# syntax=docker/dockerfile:1.7

FROM node:22.14.0-bookworm-slim AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12.10-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/backend

WORKDIR /app

RUN addgroup --system --gid 10001 frota \
    && adduser --system --uid 10001 --ingroup frota --home /nonexistent --no-create-home frota

COPY backend/requirements.txt /tmp/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-build /build/frontend/dist /app/frontend/dist

RUN mkdir -p /data/uploads /tmp \
    && chown -R frota:frota /app /data/uploads /tmp

WORKDIR /app/backend
USER frota

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
