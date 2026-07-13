from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import psycopg
import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.deps import require_writer
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db_session
from app.main import app
from app.models.user import User, UserRole
from app.schemas.possession_trip import TripCreate, TripDestinationCreate
from app.repositories.possession_trip_repository import PossessionTripRepository
from app.repositories.possession_repository import PossessionRepository
from app.services.audit_service import AuditService
from app.services.possession_trip_service import PossessionTripService


PHASE3_DATABASE_URL = os.getenv("PHASE3_TEST_DATABASE_URL")
requires_phase3_database = pytest.mark.skipif(
    not PHASE3_DATABASE_URL,
    reason="PHASE3_TEST_DATABASE_URL não configurada",
)
CSRF_HEADERS = {
    "X-CSRF-Token": "phase3-csrf-token",
    "Origin": "http://localhost:8000",
}


def _sync_database_url() -> str:
    assert PHASE3_DATABASE_URL
    return PHASE3_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)


def _unique_cpf() -> str:
    return str(uuid4().int % 100_000_000_000).zfill(11)


def _seed_user(connection, role: str = "ADMIN") -> UUID:
    suffix = uuid4().hex[:12]
    return connection.execute(
        "INSERT INTO users (name, email, cpf, password_hash, role, must_change_password) "
        "VALUES (%s, %s, %s, 'not-a-real-password-hash', %s, false) RETURNING id",
        (f"Usuário Fase 3 {suffix}", f"phase3-{suffix}@example.test", _unique_cpf(), role),
    ).fetchone()[0]


def _seed_vehicle(connection) -> UUID:
    suffix = uuid4().hex[:12]
    return connection.execute(
        "INSERT INTO vehicles (plate, brand, model, status, vehicle_type, ownership_type) "
        "VALUES (%s, 'Teste', 'Fase 3', 'ATIVO', 'SEDAN', 'PROPRIO') RETURNING id",
        (f"R{suffix[:7]}",),
    ).fetchone()[0]


def _seed_possession(
    connection,
    *,
    vehicle_id: UUID,
    start_at: datetime | None = None,
    start_odometer: float = 100.0,
) -> UUID:
    return connection.execute(
        "INSERT INTO vehicle_possession (vehicle_id, driver_name, start_date, start_odometer_km) "
        "VALUES (%s, 'Condutor da Fase 3', %s, %s) RETURNING id",
        (vehicle_id, start_at or datetime.now(timezone.utc) - timedelta(hours=1), start_odometer),
    ).fetchone()[0]


def _seed_open_trip(connection, *, possession_id: UUID, user_id: UUID, start_odometer: float = 100.0) -> UUID:
    return connection.execute(
        "INSERT INTO vehicle_possession_trip "
        "(possession_id, sequence_number, status, origin, purpose, departure_at, start_odometer_km, created_by_user_id) "
        "VALUES (%s, 1, 'EM_ANDAMENTO', 'Garagem', 'Rota de teste', NOW(), %s, %s) RETURNING id",
        (possession_id, start_odometer, user_id),
    ).fetchone()[0]


def _authenticate(client: AsyncClient, user_id: UUID, role: str) -> None:
    client.cookies.set(settings.COOKIE_NAME, create_access_token(subject=str(user_id), role=role))
    client.cookies.set(settings.CSRF_COOKIE_NAME, CSRF_HEADERS["X-CSRF-Token"])


@pytest_asyncio.fixture
async def phase3_client():
    if not PHASE3_DATABASE_URL:
        pytest.skip("PHASE3_TEST_DATABASE_URL não configurada")
    engine = create_async_engine(PHASE3_DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        await engine.dispose()


def test_trip_schema_rejects_naive_datetime_and_extra_fields():
    with pytest.raises(ValueError):
        TripCreate.model_validate(
            {
                "origin": "Garagem",
                "purpose": "Teste",
                "departure_at": "2026-07-13T10:00:00",
                "start_odometer_km": "100.0",
            }
        )
    with pytest.raises(ValueError):
        TripDestinationCreate.model_validate({"description": "Destino", "role": "ADMIN"})


def test_trip_repository_has_no_commit_or_delete_contract():
    assert not hasattr(PossessionTripRepository, "commit")
    assert not hasattr(PossessionTripRepository, "delete")
    assert not hasattr(PossessionRepository, "end_active_for_vehicle")


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.PRODUCAO])
async def test_require_writer_accepts_only_operational_roles(role):
    user = SimpleNamespace(role=role)
    assert await require_writer(current_user=user) is user


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.PADRAO, UserRole.POSTO])
async def test_require_writer_rejects_read_only_roles(role):
    with pytest.raises(HTTPException) as exc:
        await require_writer(current_user=SimpleNamespace(role=role))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_trip_api_requires_authentication_and_csrf(client):
    possession_id = uuid4()
    payload = {
        "origin": "Garagem",
        "purpose": "Teste",
        "departure_at": datetime.now(timezone.utc).isoformat(),
        "start_odometer_km": "100.0",
    }
    unauthenticated = await client.post(f"/api/possession/{possession_id}/trips", json=payload)
    assert unauthenticated.status_code == 401

    client.cookies.set(settings.COOKIE_NAME, "fake-token")
    missing_csrf = await client.post(f"/api/possession/{possession_id}/trips", json=payload)
    assert missing_csrf.status_code == 403
    assert missing_csrf.json()["code"] == "CSRF_TOKEN_INVALID"


@requires_phase3_database
@pytest.mark.asyncio
async def test_create_possession_without_trip_and_with_atomic_initial_trip(phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_without_trip = _seed_vehicle(connection)
        vehicle_with_trip = _seed_vehicle(connection)
        connection.commit()

    _authenticate(phase3_client, user_id, "ADMIN")
    start_at = datetime.now(timezone.utc).replace(microsecond=0)
    without_trip = await phase3_client.post(
        "/api/possession",
        data={
            "vehicle_id": str(vehicle_without_trip),
            "driver_name": "Condutor sem rota",
            "start_date": start_at.isoformat(),
            "start_odometer_km": "100.0",
        },
        headers={**CSRF_HEADERS, "X-Request-ID": "phase3-create-no-trip"},
    )
    assert without_trip.status_code == 200, without_trip.text
    assert without_trip.json()["public_number"] > 0

    initial_trip = {
        "origin": "Garagem central",
        "purpose": "Atendimento operacional",
        "departure_at": start_at.isoformat(),
        "start_odometer_km": "200.0",
        "destinations": [
            {"description": "Destino um"},
            {"description": "Destino dois", "address_reference": "Referência interna"},
        ],
    }
    with_trip = await phase3_client.post(
        "/api/possession",
        data={
            "vehicle_id": str(vehicle_with_trip),
            "driver_name": "Condutor com rota",
            "start_date": start_at.isoformat(),
            "start_odometer_km": "200.0",
            "initial_trip_json": json.dumps(initial_trip),
        },
        headers={**CSRF_HEADERS, "X-Request-ID": "phase3-create-with-trip"},
    )
    assert with_trip.status_code == 200, with_trip.text
    possession_id = UUID(with_trip.json()["id"])

    with psycopg.connect(_sync_database_url()) as connection:
        no_trip_count = connection.execute(
            "SELECT count(*) FROM vehicle_possession_trip WHERE possession_id = %s",
            (UUID(without_trip.json()["id"]),),
        ).fetchone()[0]
        trip_id = connection.execute(
            "SELECT id FROM vehicle_possession_trip WHERE possession_id = %s",
            (possession_id,),
        ).fetchone()[0]
        destination_count = connection.execute(
            "SELECT count(*) FROM vehicle_possession_trip_destination WHERE trip_id = %s",
            (trip_id,),
        ).fetchone()[0]
        audit_actions = {
            row[0]
            for row in connection.execute(
                "SELECT action FROM audit_logs WHERE entity_id IN (%s, %s)",
                (possession_id, trip_id),
            )
        }
    assert no_trip_count == 0
    assert destination_count == 2
    assert {"POSSESSION_CREATE", "TRIP_CREATE", "TRIP_DESTINATION_ADD"}.issubset(audit_actions)


@requires_phase3_database
@pytest.mark.asyncio
async def test_active_possession_requires_explicit_audited_replacement(phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_id = _seed_vehicle(connection)
        previous_id = _seed_possession(connection, vehicle_id=vehicle_id)
        connection.commit()

    _authenticate(phase3_client, user_id, "ADMIN")
    start_at = datetime.now(timezone.utc).replace(microsecond=0)
    base_data = {
        "vehicle_id": str(vehicle_id),
        "driver_name": "Novo condutor",
        "start_date": start_at.isoformat(),
        "start_odometer_km": "100.0",
    }
    conflict = await phase3_client.post("/api/possession", data=base_data, headers=CSRF_HEADERS)
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "ACTIVE_POSSESSION_EXISTS"

    replaced = await phase3_client.post(
        "/api/possession",
        data={
            **base_data,
            "replace_active": "true",
            "replacement_reason": "Troca operacional confirmada pelo responsável",
        },
        headers={**CSRF_HEADERS, "X-Request-ID": "phase3-replace-active"},
    )
    assert replaced.status_code == 200, replaced.text
    new_id = UUID(replaced.json()["id"])

    with psycopg.connect(_sync_database_url()) as connection:
        previous_end = connection.execute(
            "SELECT end_date FROM vehicle_possession WHERE id = %s",
            (previous_id,),
        ).fetchone()[0]
        active_ids = [
            row[0]
            for row in connection.execute(
                "SELECT id FROM vehicle_possession WHERE vehicle_id = %s AND end_date IS NULL",
                (vehicle_id,),
            )
        ]
        audit = connection.execute(
            "SELECT details FROM audit_logs WHERE action = 'POSSESSION_REPLACE_ACTIVE' AND entity_id = %s",
            (new_id,),
        ).fetchone()[0]
    assert previous_end == start_at
    assert active_ids == [new_id]
    assert audit["previous_possession_id"] == str(previous_id)
    assert audit["request_context"]["request_id"] == "phase3-replace-active"


@requires_phase3_database
@pytest.mark.asyncio
async def test_replacement_and_possession_end_are_blocked_by_open_trip(phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_id = _seed_vehicle(connection)
        possession_id = _seed_possession(connection, vehicle_id=vehicle_id)
        _seed_open_trip(connection, possession_id=possession_id, user_id=user_id)
        connection.commit()

    _authenticate(phase3_client, user_id, "ADMIN")
    replacement = await phase3_client.post(
        "/api/possession",
        data={
            "vehicle_id": str(vehicle_id),
            "driver_name": "Outro condutor",
            "start_date": datetime.now(timezone.utc).isoformat(),
            "start_odometer_km": "100.0",
            "replace_active": "true",
            "replacement_reason": "Substituição solicitada para teste",
        },
        headers=CSRF_HEADERS,
    )
    assert replacement.status_code == 409
    assert replacement.json()["detail"]["code"] == "ACTIVE_POSSESSION_HAS_OPEN_TRIP"

    end_response = await phase3_client.put(
        f"/api/possession/{possession_id}/end",
        json={"end_date": datetime.now(timezone.utc).isoformat(), "end_odometer_km": 101.0},
        headers=CSRF_HEADERS,
    )
    assert end_response.status_code == 409
    assert end_response.json()["detail"]["code"] == "POSSESSION_HAS_OPEN_TRIP"

    with psycopg.connect(_sync_database_url()) as connection:
        assert connection.execute(
            "SELECT end_date IS NULL FROM vehicle_possession WHERE id = %s",
            (possession_id,),
        ).fetchone()[0] is True


@requires_phase3_database
@pytest.mark.asyncio
async def test_closed_possession_rejects_new_trip(phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_id = _seed_vehicle(connection)
        possession_id = _seed_possession(connection, vehicle_id=vehicle_id)
        connection.execute(
            "UPDATE vehicle_possession SET end_date = NOW(), end_odometer_km = 100.0 WHERE id = %s",
            (possession_id,),
        )
        connection.commit()

    _authenticate(phase3_client, user_id, "ADMIN")
    response = await phase3_client.post(
        f"/api/possession/{possession_id}/trips",
        json={
            "origin": "Garagem",
            "purpose": "Não permitido",
            "departure_at": datetime.now(timezone.utc).isoformat(),
            "start_odometer_km": "100.0",
        },
        headers=CSRF_HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "POSSESSION_ALREADY_ENDED"


@requires_phase3_database
@pytest.mark.asyncio
async def test_trip_lifecycle_idor_and_restricted_read(phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        admin_id = _seed_user(connection, "ADMIN")
        padrao_id = _seed_user(connection, "PADRAO")
        posto_id = _seed_user(connection, "POSTO")
        first_vehicle = _seed_vehicle(connection)
        second_vehicle = _seed_vehicle(connection)
        start_at = datetime.now(timezone.utc) - timedelta(hours=2)
        first_possession = _seed_possession(connection, vehicle_id=first_vehicle, start_at=start_at)
        second_possession = _seed_possession(connection, vehicle_id=second_vehicle, start_at=start_at)
        connection.commit()

    _authenticate(phase3_client, admin_id, "ADMIN")
    departure = datetime.now(timezone.utc) - timedelta(hours=1)
    created = await phase3_client.post(
        f"/api/possession/{first_possession}/trips",
        json={
            "origin": "Garagem sigilosa",
            "purpose": "Atendimento",
            "departure_at": departure.isoformat(),
            "start_odometer_km": "100.0",
            "destinations": [{"description": "Destino restrito", "address_reference": "Rua interna"}],
        },
        headers=CSRF_HEADERS,
    )
    assert created.status_code == 201, created.text
    trip_id = UUID(created.json()["id"])

    idor = await phase3_client.get(f"/api/possession/{second_possession}/trips/{trip_id}")
    assert idor.status_code == 404

    added = await phase3_client.post(
        f"/api/possession/{first_possession}/trips/{trip_id}/destinations",
        json={"destinations": [{"description": "Destino adicional"}]},
        headers=CSRF_HEADERS,
    )
    assert added.status_code == 200
    assert [item["sequence_number"] for item in added.json()["destinations"]] == [1, 2]

    invalid_end = await phase3_client.put(
        f"/api/possession/{first_possession}/trips/{trip_id}/end",
        json={"return_at": (departure - timedelta(minutes=1)).isoformat(), "end_odometer_km": "99.0"},
        headers=CSRF_HEADERS,
    )
    assert invalid_end.status_code == 422

    valid_end = await phase3_client.put(
        f"/api/possession/{first_possession}/trips/{trip_id}/end",
        json={"return_at": datetime.now(timezone.utc).isoformat(), "end_odometer_km": "105.0"},
        headers={**CSRF_HEADERS, "X-Request-ID": "phase3-trip-end"},
    )
    assert valid_end.status_code == 200, valid_end.text
    assert valid_end.json()["status"] == "ENCERRADA"
    assert valid_end.json()["kilometers_driven"] == "5.0"

    closed_destination = await phase3_client.post(
        f"/api/possession/{first_possession}/trips/{trip_id}/destinations",
        json={"destinations": [{"description": "Não permitido"}]},
        headers=CSRF_HEADERS,
    )
    assert closed_destination.status_code == 409

    second_trip = await phase3_client.post(
        f"/api/possession/{first_possession}/trips",
        json={
            "origin": "Garagem",
            "purpose": "Rota cancelada",
            "departure_at": datetime.now(timezone.utc).isoformat(),
            "start_odometer_km": "105.0",
        },
        headers=CSRF_HEADERS,
    )
    assert second_trip.status_code == 201, second_trip.text
    second_trip_id = UUID(second_trip.json()["id"])
    missing_reason = await phase3_client.put(
        f"/api/possession/{first_possession}/trips/{second_trip_id}/cancel",
        json={},
        headers=CSRF_HEADERS,
    )
    assert missing_reason.status_code == 422
    cancelled = await phase3_client.put(
        f"/api/possession/{first_possession}/trips/{second_trip_id}/cancel",
        json={"reason": "Rota cancelada por mudança operacional"},
        headers=CSRF_HEADERS,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELADA"

    filtered = await phase3_client.get(
        f"/api/possession/{first_possession}/trips",
        params={"status": "CANCELADA", "page": 1, "limit": 1},
    )
    assert filtered.status_code == 200
    assert filtered.json()["pagination"]["total"] == 1
    assert filtered.json()["data"][0]["id"] == str(second_trip_id)

    _authenticate(phase3_client, padrao_id, "PADRAO")
    restricted = await phase3_client.get(f"/api/possession/{first_possession}/trips/{trip_id}")
    assert restricted.status_code == 200
    assert restricted.json()["origin"] != "Garagem sigilosa"
    assert restricted.json()["origin"].endswith("restrita")
    assert restricted.json()["destinations"] == []
    assert restricted.json()["operational_details_restricted"] is True
    forbidden_mutation = await phase3_client.post(
        f"/api/possession/{first_possession}/trips",
        json={
            "origin": "Garagem",
            "purpose": "Forjado",
            "departure_at": datetime.now(timezone.utc).isoformat(),
            "start_odometer_km": "105.0",
        },
        headers=CSRF_HEADERS,
    )
    assert forbidden_mutation.status_code == 403

    _authenticate(phase3_client, posto_id, "POSTO")
    assert (await phase3_client.get(f"/api/possession/{first_possession}/trips/{trip_id}")).status_code == 403

    with psycopg.connect(_sync_database_url()) as connection:
        audit_actions = {
            row[0]
            for row in connection.execute(
                "SELECT action FROM audit_logs WHERE entity_id IN (%s, %s)",
                (trip_id, second_trip_id),
            )
        }
    assert {"TRIP_CREATE", "TRIP_DESTINATION_ADD", "TRIP_END", "TRIP_CANCEL"}.issubset(audit_actions)


@requires_phase3_database
@pytest.mark.asyncio
async def test_initial_trip_destination_failure_rolls_back_every_database_record(monkeypatch, phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_id = _seed_vehicle(connection)
        connection.commit()

    original_add = PossessionTripRepository.add_destination
    calls = 0

    async def fail_second_destination(self, destination):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("forced destination failure")
        return await original_add(self, destination)

    monkeypatch.setattr(PossessionTripRepository, "add_destination", fail_second_destination)
    _authenticate(phase3_client, user_id, "ADMIN")
    start_at = datetime.now(timezone.utc).replace(microsecond=0)
    response = await phase3_client.post(
        "/api/possession",
        data={
            "vehicle_id": str(vehicle_id),
            "driver_name": "Rollback composto",
            "start_date": start_at.isoformat(),
            "start_odometer_km": "400.0",
            "initial_trip_json": json.dumps(
                {
                    "origin": "Garagem",
                    "purpose": "Falha controlada",
                    "departure_at": start_at.isoformat(),
                    "start_odometer_km": "400.0",
                    "destinations": [
                        {"description": "Primeiro destino"},
                        {"description": "Segundo destino"},
                    ],
                }
            ),
        },
        headers=CSRF_HEADERS,
    )
    assert response.status_code == 500

    with psycopg.connect(_sync_database_url()) as connection:
        possession_count = connection.execute(
            "SELECT count(*) FROM vehicle_possession WHERE vehicle_id = %s",
            (vehicle_id,),
        ).fetchone()[0]
        trip_count = connection.execute(
            "SELECT count(*) FROM vehicle_possession_trip trip "
            "JOIN vehicle_possession possession ON possession.id = trip.possession_id "
            "WHERE possession.vehicle_id = %s",
            (vehicle_id,),
        ).fetchone()[0]
        audit_count = connection.execute(
            "SELECT count(*) FROM audit_logs WHERE details->>'vehicle_id' = %s",
            (str(vehicle_id),),
        ).fetchone()[0]
    assert (possession_count, trip_count, audit_count) == (0, 0, 0)


@requires_phase3_database
@pytest.mark.asyncio
async def test_composed_possession_failure_rolls_back_database_and_file(monkeypatch, phase3_client):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_id = _seed_vehicle(connection)
        connection.commit()

    async def fail_audit(*_args, **_kwargs):
        raise RuntimeError("forced audit failure")

    documents_dir = Path(settings.STORAGE_DIR) / "possession_documents"
    files_before = set(documents_dir.glob("*")) if documents_dir.exists() else set()
    monkeypatch.setattr(AuditService, "record", fail_audit)
    _authenticate(phase3_client, user_id, "ADMIN")
    response = await phase3_client.post(
        "/api/possession",
        data={
            "vehicle_id": str(vehicle_id),
            "driver_name": "Rollback de arquivo",
            "start_odometer_km": "300.0",
        },
        files={"loan_term_document": ("termo.pdf", b"%PDF-1.4 phase3", "application/pdf")},
        headers=CSRF_HEADERS,
    )
    assert response.status_code == 500

    files_after = set(documents_dir.glob("*")) if documents_dir.exists() else set()
    with psycopg.connect(_sync_database_url()) as connection:
        count = connection.execute(
            "SELECT count(*) FROM vehicle_possession WHERE vehicle_id = %s",
            (vehicle_id,),
        ).fetchone()[0]
    assert count == 0
    assert files_after == files_before


@requires_phase3_database
@pytest.mark.asyncio
async def test_concurrent_trip_and_destination_creation_are_serialized():
    assert PHASE3_DATABASE_URL
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = _seed_user(connection)
        vehicle_id = _seed_vehicle(connection)
        possession_id = _seed_possession(connection, vehicle_id=vehicle_id)
        connection.commit()

    engine = create_async_engine(PHASE3_DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    departure = datetime.now(timezone.utc)

    async def create_trip(purpose: str):
        async with session_factory() as session:
            user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
            try:
                result = await PossessionTripService(session).create(
                    possession_id,
                    TripCreate(
                        origin="Garagem",
                        purpose=purpose,
                        departure_at=departure,
                        start_odometer_km="100.0",
                    ),
                    current_user=user,
                )
                return result["id"]
            except HTTPException as exc:
                return exc.status_code

    try:
        results = await asyncio.gather(create_trip("Concorrente A"), create_trip("Concorrente B"))
        assert sorted(isinstance(item, UUID) for item in results) == [False, True]
        assert 409 in results
        trip_id = next(item for item in results if isinstance(item, UUID))

        async def add_destination(description: str):
            async with session_factory() as session:
                user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
                await PossessionTripService(session).add_destinations(
                    possession_id,
                    trip_id,
                    [TripDestinationCreate(description=description)],
                    current_user=user,
                )

        await asyncio.gather(add_destination("Concorrente 1"), add_destination("Concorrente 2"))
        async with engine.connect() as connection:
            sequences = list(
                (
                    await connection.execute(
                        text(
                            "SELECT sequence_number FROM vehicle_possession_trip_destination "
                            "WHERE trip_id = :trip_id ORDER BY sequence_number"
                        ),
                        {"trip_id": trip_id},
                    )
                ).scalars()
            )
        assert sequences == [1, 2]
    finally:
        await engine.dispose()
