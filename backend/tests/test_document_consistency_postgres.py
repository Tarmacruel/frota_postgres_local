from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

import psycopg
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.document_signature import DigitalDocumentType
from app.models.possession import VehiclePossession
from app.repositories.possession_repository import PossessionRepository
from app.services.document_signature_service import DocumentSignatureService


DATABASE_URL = os.getenv("PHASE3_TEST_DATABASE_URL")
requires_postgres = pytest.mark.skipif(
    not DATABASE_URL,
    reason="PHASE3_TEST_DATABASE_URL não configurada",
)


def _sync_database_url() -> str:
    assert DATABASE_URL
    return DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)


def _valid_unique_cpf() -> str:
    base = str(uuid4().int % 1_000_000_000).zfill(9)
    if len(set(base)) == 1:
        base = "529982247"
    numbers = [int(character) for character in base]
    first = (sum(numbers[index] * (10 - index) for index in range(9)) * 10 % 11) % 10
    numbers.append(first)
    second = (sum(numbers[index] * (11 - index) for index in range(10)) * 10 % 11) % 10
    return f"{base}{first}{second}"


def _seed_graph() -> tuple[UUID, UUID]:
    suffix = uuid4().hex[:12]
    with psycopg.connect(_sync_database_url()) as connection:
        user_id = connection.execute(
            "INSERT INTO users (name, email, cpf, password_hash, role, must_change_password) "
            "VALUES (%s, %s, %s, 'not-a-real-password-hash', 'ADMIN', false) RETURNING id",
            (f"Consistência {suffix}", f"consistency-{suffix}@example.test", _valid_unique_cpf()),
        ).fetchone()[0]
        vehicle_id = connection.execute(
            "INSERT INTO vehicles (plate, brand, model, status, vehicle_type, ownership_type) "
            "VALUES (%s, 'Marca inicial', 'Modelo inicial', 'ATIVO', 'SEDAN', 'PROPRIO') RETURNING id",
            (f"C{suffix[:7]}",),
        ).fetchone()[0]
        possession_id = connection.execute(
            "INSERT INTO vehicle_possession "
            "(vehicle_id, driver_name, start_date, start_odometer_km, observation) "
            "VALUES (%s, 'Condutor de consistência', %s, 100.0, 'Observação inicial') RETURNING id",
            (vehicle_id, datetime.now(timezone.utc)),
        ).fetchone()[0]
        trip_id = connection.execute(
            "INSERT INTO vehicle_possession_trip "
            "(possession_id, sequence_number, status, origin, purpose, departure_at, "
            "start_odometer_km, created_by_user_id) "
            "VALUES (%s, 1, 'EM_ANDAMENTO', 'Origem inicial', 'Finalidade inicial', NOW(), 100.0, %s) "
            "RETURNING id",
            (possession_id, user_id),
        ).fetchone()[0]
        connection.execute(
            "INSERT INTO vehicle_possession_trip_destination "
            "(trip_id, sequence_number, description, created_by_user_id) "
            "VALUES (%s, 1, 'Destino inicial', %s)",
            (trip_id, user_id),
        )
        connection.commit()
    return possession_id, vehicle_id


@requires_postgres
@pytest.mark.asyncio
async def test_locked_term_graph_refreshes_scalars_vehicle_and_nested_collections():
    possession_id, vehicle_id = _seed_graph()
    engine = create_async_engine(DATABASE_URL)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessions() as session:
            repository = PossessionRepository(session)
            initial = await repository.get_term_graph(possession_id)
            assert initial is not None
            assert initial.observation == "Observação inicial"
            assert initial.vehicle.model == "Modelo inicial"
            assert initial.trips[0].destinations[0].description == "Destino inicial"

            with psycopg.connect(_sync_database_url()) as writer:
                writer.execute(
                    "UPDATE vehicle_possession SET observation = 'Observação atualizada' WHERE id = %s",
                    (possession_id,),
                )
                writer.execute(
                    "UPDATE vehicles SET model = 'Modelo atualizado' WHERE id = %s",
                    (vehicle_id,),
                )
                writer.execute(
                    "UPDATE vehicle_possession_trip_destination SET description = 'Destino atualizado' "
                    "WHERE trip_id = (SELECT id FROM vehicle_possession_trip WHERE possession_id = %s LIMIT 1)",
                    (possession_id,),
                )
                writer.commit()

            signatures = DocumentSignatureService(session)
            await signatures._lock_source(
                DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
                possession_id,
            )
            refreshed = await repository.get_term_graph(possession_id, populate_existing=True)
            assert refreshed is initial
            assert refreshed.observation == "Observação atualizada"
            assert refreshed.vehicle.model == "Modelo atualizado"
            assert refreshed.trips[0].destinations[0].description == "Destino atualizado"

            async def concurrent_update() -> None:
                async with sessions() as writer_session:
                    await writer_session.execute(
                        update(VehiclePossession)
                        .where(VehiclePossession.id == possession_id)
                        .values(observation="Atualização após liberação")
                    )
                    await writer_session.commit()

            update_task = asyncio.create_task(concurrent_update())
            await asyncio.sleep(0.15)
            assert not update_task.done()
            await session.rollback()
            await asyncio.wait_for(update_task, timeout=5)
    finally:
        await engine.dispose()
