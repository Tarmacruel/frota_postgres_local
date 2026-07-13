from __future__ import annotations

import asyncio
import importlib.util
import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.possession_trip import VehiclePossessionTrip, VehiclePossessionTripStatus
from app.repositories.possession_trip_repository import (
    PossessionReturnConfirmationRepository,
    PossessionTripRepository,
)


PHASE2_DATABASE_URL = os.getenv("PHASE2_TEST_DATABASE_URL")
requires_phase2_database = pytest.mark.skipif(
    not PHASE2_DATABASE_URL,
    reason="PHASE2_TEST_DATABASE_URL não configurada",
)


def _sync_database_url() -> str:
    assert PHASE2_DATABASE_URL
    return PHASE2_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)


def _seed_possession(connection) -> tuple[object, object, object]:
    suffix = uuid4().hex[:12]
    user_id = connection.execute(
        "INSERT INTO users (name, email, password_hash, role) "
        "VALUES (%s, %s, %s, 'ADMIN') RETURNING id",
        ("Administrador de teste", f"phase2-{suffix}@example.test", "not-a-real-password-hash"),
    ).fetchone()[0]
    vehicle_id = connection.execute(
        "INSERT INTO vehicles (plate, brand, model, status, vehicle_type, ownership_type) "
        "VALUES (%s, 'Teste', 'Fase 2', 'ATIVO', 'SEDAN', 'PROPRIO') RETURNING id",
        (f"T{suffix[:7]}",),
    ).fetchone()[0]
    possession_id, public_number = connection.execute(
        "INSERT INTO vehicle_possession (vehicle_id, driver_name, start_date) "
        "VALUES (%s, 'Condutor de teste', NOW()) RETURNING id, public_number",
        (vehicle_id,),
    ).fetchone()
    connection.commit()
    assert public_number > 0
    return user_id, vehicle_id, possession_id


def _insert_closed_trip(connection, *, possession_id, user_id, sequence_number: int = 1):
    departure = datetime.now(timezone.utc) - timedelta(hours=1)
    return connection.execute(
        "INSERT INTO vehicle_possession_trip "
        "(possession_id, sequence_number, status, origin, purpose, departure_at, return_at, "
        "start_odometer_km, end_odometer_km, created_by_user_id, closed_by_user_id, closed_at) "
        "VALUES (%s, %s, 'ENCERRADA', 'Garagem', 'Teste de integridade', %s, %s, 100.0, 101.0, %s, %s, %s) "
        "RETURNING id",
        (possession_id, sequence_number, departure, departure + timedelta(minutes=30), user_id, user_id, departure + timedelta(minutes=30)),
    ).fetchone()[0]


def _insert_confirmation(connection, *, possession_id, user_id, version: int = 1):
    return connection.execute(
        "INSERT INTO vehicle_possession_return_confirmation "
        "(possession_id, version, is_current, declaration_version, declaration_text, canonical_payload_hash, "
        "confirmed_by_user_id, confirmer_name, confirmer_email, confirmer_role, request_id, ip_address, "
        "user_agent, final_odometer_km, vehicle_condition_notes, admin_correction_reason) "
        "VALUES (%s, %s, true, 'v1', 'Declaração autenticada de teste', %s, %s, "
        "'Administrador de teste', 'phase2@example.test', 'ADMIN', 'phase2-request-1234', '127.0.0.1', "
        "'pytest', 101.0, 'Veículo em condições de teste', %s) RETURNING id",
        (possession_id, version, "a" * 64, user_id, None if version == 1 else "Correção administrativa de teste"),
    ).fetchone()[0]


def test_phase2_migration_has_confirmed_parent_revision():
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "0039_add_possession_trips.py"
    spec = importlib.util.spec_from_file_location("phase2_migration", migration_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "0039_possession_trips"
    assert module.down_revision == "0038_require_user_cpf"


def test_new_repositories_do_not_expose_hard_delete():
    assert not hasattr(PossessionTripRepository, "delete")
    assert not hasattr(PossessionReturnConfirmationRepository, "delete")


@requires_phase2_database
def test_clean_migration_created_expected_schema_and_public_number_default():
    with psycopg.connect(_sync_database_url()) as connection:
        head = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name LIKE 'vehicle_possession%'"
            )
        }
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        second_user_id, _second_vehicle_id, second_possession_id = _seed_possession(connection)
        numbers = [
            row[0]
            for row in connection.execute(
                "SELECT public_number FROM vehicle_possession WHERE id IN (%s, %s) ORDER BY public_number",
                (possession_id, second_possession_id),
            )
        ]

    # The clean-database proof runs the complete migration graph, whose
    # production head moved to 0040 after the Phase 2 schema was introduced.
    assert head == "0040_report_preferences"
    assert {
        "vehicle_possession",
        "vehicle_possession_photos",
        "vehicle_possession_trip",
        "vehicle_possession_trip_destination",
        "vehicle_possession_return_confirmation",
    }.issubset(tables)
    assert len(numbers) == len(set(numbers)) == 2
    assert numbers[1] > numbers[0] > 0
    assert user_id != second_user_id


@requires_phase2_database
def test_database_rejects_second_open_trip_and_duplicate_sequence():
    with psycopg.connect(_sync_database_url()) as connection:
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        connection.execute(
            "INSERT INTO vehicle_possession_trip "
            "(possession_id, sequence_number, status, origin, purpose, departure_at, start_odometer_km, created_by_user_id) "
            "VALUES (%s, 1, 'EM_ANDAMENTO', 'Garagem', 'Primeira rota', NOW(), 100.0, %s)",
            (possession_id, user_id),
        )
        connection.commit()

        with pytest.raises(psycopg.errors.UniqueViolation), connection.transaction():
            connection.execute(
                "INSERT INTO vehicle_possession_trip "
                "(possession_id, sequence_number, status, origin, purpose, departure_at, start_odometer_km, created_by_user_id) "
                "VALUES (%s, 2, 'EM_ANDAMENTO', 'Garagem', 'Segunda rota', NOW(), 101.0, %s)",
                (possession_id, user_id),
            )

    with psycopg.connect(_sync_database_url()) as connection:
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        _insert_closed_trip(connection, possession_id=possession_id, user_id=user_id, sequence_number=1)
        connection.commit()
        with pytest.raises(psycopg.errors.UniqueViolation), connection.transaction():
            _insert_closed_trip(connection, possession_id=possession_id, user_id=user_id, sequence_number=1)


@requires_phase2_database
@pytest.mark.parametrize(
    ("return_offset_minutes", "end_odometer"),
    [(-1, Decimal("101.0")), (30, Decimal("99.9"))],
)
def test_database_rejects_invalid_return_or_odometer(return_offset_minutes, end_odometer):
    with psycopg.connect(_sync_database_url()) as connection:
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        departure = datetime.now(timezone.utc)
        with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
            connection.execute(
                "INSERT INTO vehicle_possession_trip "
                "(possession_id, sequence_number, status, origin, purpose, departure_at, return_at, "
                "start_odometer_km, end_odometer_km, created_by_user_id, closed_by_user_id, closed_at) "
                "VALUES (%s, 1, 'ENCERRADA', 'Garagem', 'Rota inválida', %s, %s, 100.0, %s, %s, %s, %s)",
                (
                    possession_id,
                    departure,
                    departure + timedelta(minutes=return_offset_minutes),
                    end_odometer,
                    user_id,
                    user_id,
                    departure + timedelta(minutes=30),
                ),
            )


@requires_phase2_database
def test_destination_sequence_and_time_order_are_enforced_and_delete_is_blocked():
    with psycopg.connect(_sync_database_url()) as connection:
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        trip_id = connection.execute(
            "INSERT INTO vehicle_possession_trip "
            "(possession_id, sequence_number, status, origin, purpose, departure_at, start_odometer_km, created_by_user_id) "
            "VALUES (%s, 1, 'EM_ANDAMENTO', 'Garagem', 'Destinos', NOW(), 100.0, %s) RETURNING id",
            (possession_id, user_id),
        ).fetchone()[0]
        destination_id = connection.execute(
            "INSERT INTO vehicle_possession_trip_destination "
            "(trip_id, sequence_number, description, created_by_user_id) "
            "VALUES (%s, 1, 'Destino válido', %s) RETURNING id",
            (trip_id, user_id),
        ).fetchone()[0]
        connection.commit()

        with pytest.raises(psycopg.errors.UniqueViolation), connection.transaction():
            connection.execute(
                "INSERT INTO vehicle_possession_trip_destination "
                "(trip_id, sequence_number, description, created_by_user_id) "
                "VALUES (%s, 1, 'Destino duplicado', %s)",
                (trip_id, user_id),
            )
        with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
            connection.execute(
                "INSERT INTO vehicle_possession_trip_destination "
                "(trip_id, sequence_number, description, arrived_at, departed_at, created_by_user_id) "
                "VALUES (%s, 2, 'Tempo inválido', NOW(), NOW() - INTERVAL '1 minute', %s)",
                (trip_id, user_id),
            )
        with pytest.raises(psycopg.errors.IntegrityError), connection.transaction():
            connection.execute(
                "DELETE FROM vehicle_possession_trip_destination WHERE id = %s",
                (destination_id,),
            )
        with pytest.raises(psycopg.errors.IntegrityError), connection.transaction():
            connection.execute("DELETE FROM vehicle_possession_trip WHERE id = %s", (trip_id,))


@requires_phase2_database
def test_current_confirmation_is_unique_append_only_and_delete_is_blocked():
    with psycopg.connect(_sync_database_url()) as connection:
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        confirmation_id = _insert_confirmation(
            connection,
            possession_id=possession_id,
            user_id=user_id,
        )
        connection.commit()

        with pytest.raises(psycopg.errors.UniqueViolation), connection.transaction():
            _insert_confirmation(
                connection,
                possession_id=possession_id,
                user_id=user_id,
                version=2,
            )
        with pytest.raises(psycopg.errors.IntegrityError), connection.transaction():
            connection.execute(
                "UPDATE vehicle_possession_return_confirmation SET declaration_text = 'alterada' WHERE id = %s",
                (confirmation_id,),
            )
        with pytest.raises(psycopg.errors.IntegrityError), connection.transaction():
            connection.execute(
                "DELETE FROM vehicle_possession_return_confirmation WHERE id = %s",
                (confirmation_id,),
            )
        with pytest.raises(psycopg.errors.IntegrityError), connection.transaction():
            connection.execute("DELETE FROM vehicle_possession WHERE id = %s", (possession_id,))


@requires_phase2_database
def test_administrative_correction_preserves_confirmation_history():
    with psycopg.connect(_sync_database_url()) as connection:
        user_id, _vehicle_id, possession_id = _seed_possession(connection)
        previous_id = _insert_confirmation(connection, possession_id=possession_id, user_id=user_id)
        connection.commit()
        replacement_id = uuid4()

        with connection.transaction():
            connection.execute(
                "UPDATE vehicle_possession_return_confirmation "
                "SET is_current = false, superseded_at = NOW(), superseded_by_confirmation_id = %s "
                "WHERE id = %s",
                (replacement_id, previous_id),
            )
            connection.execute(
                "INSERT INTO vehicle_possession_return_confirmation "
                "(id, possession_id, version, is_current, declaration_version, declaration_text, "
                "canonical_payload_hash, confirmed_by_user_id, confirmer_name, confirmer_email, confirmer_role, "
                "request_id, ip_address, user_agent, final_odometer_km, vehicle_condition_notes, "
                "admin_correction_reason) VALUES "
                "(%s, %s, 2, true, 'v1', 'Declaração corrigida', %s, %s, 'Administrador de teste', "
                "'phase2@example.test', 'ADMIN', 'phase2-request-5678', '127.0.0.1', 'pytest', 101.0, "
                "'Veículo em condições de teste', 'Correção administrativa de teste')",
                (replacement_id, possession_id, "b" * 64, user_id),
            )

        rows = connection.execute(
            "SELECT id, version, is_current, superseded_by_confirmation_id "
            "FROM vehicle_possession_return_confirmation WHERE possession_id = %s ORDER BY version",
            (possession_id,),
        ).fetchall()

    assert rows == [
        (previous_id, 1, False, replacement_id),
        (replacement_id, 2, True, None),
    ]


async def _async_seed_possession(engine):
    suffix = uuid4().hex[:12]
    async with engine.begin() as connection:
        user_id = (
            await connection.execute(
                text(
                    "INSERT INTO users (name, email, password_hash, role) "
                    "VALUES ('Administrador concorrência', :email, 'not-a-real-password-hash', 'ADMIN') RETURNING id"
                ),
                {"email": f"phase2-async-{suffix}@example.test"},
            )
        ).scalar_one()
        vehicle_id = (
            await connection.execute(
                text(
                    "INSERT INTO vehicles (plate, brand, model, status, vehicle_type, ownership_type) "
                    "VALUES (:plate, 'Teste', 'Concorrência', 'ATIVO', 'SEDAN', 'PROPRIO') RETURNING id"
                ),
                {"plate": f"A{suffix[:7]}"},
            )
        ).scalar_one()
        possession_id = (
            await connection.execute(
                text(
                    "INSERT INTO vehicle_possession (vehicle_id, driver_name, start_date) "
                    "VALUES (:vehicle_id, 'Condutor concorrência', NOW()) RETURNING id"
                ),
                {"vehicle_id": vehicle_id},
            )
        ).scalar_one()
    return user_id, possession_id


@requires_phase2_database
@pytest.mark.asyncio
async def test_repository_loads_destinations_without_n_plus_one():
    engine = create_async_engine(PHASE2_DATABASE_URL)
    try:
        user_id, possession_id = await _async_seed_possession(engine)
        async with engine.begin() as connection:
            trip_id = (
                await connection.execute(
                    text(
                        "INSERT INTO vehicle_possession_trip "
                        "(possession_id, sequence_number, status, origin, purpose, departure_at, "
                        "start_odometer_km, created_by_user_id) "
                        "VALUES (:possession_id, 1, 'EM_ANDAMENTO', 'Garagem', 'Carga eager', NOW(), 100.0, :user_id) "
                        "RETURNING id"
                    ),
                    {"possession_id": possession_id, "user_id": user_id},
                )
            ).scalar_one()
            for sequence in (1, 2):
                await connection.execute(
                    text(
                        "INSERT INTO vehicle_possession_trip_destination "
                        "(trip_id, sequence_number, description, created_by_user_id) "
                        "VALUES (:trip_id, :sequence, :description, :user_id)"
                    ),
                    {
                        "trip_id": trip_id,
                        "sequence": sequence,
                        "description": f"Destino {sequence}",
                        "user_id": user_id,
                    },
                )

        query_count = 0

        def count_query(*_args):
            nonlocal query_count
            query_count += 1

        event.listen(engine.sync_engine, "before_cursor_execute", count_query)
        try:
            session_factory = async_sessionmaker(engine, expire_on_commit=False)
            async with session_factory() as session:
                trips = await PossessionTripRepository(session).list_by_possession(possession_id)
                assert [item.sequence_number for item in trips[0].destinations] == [1, 2]
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", count_query)

        assert query_count == 2
    finally:
        await engine.dispose()


@requires_phase2_database
@pytest.mark.asyncio
async def test_next_trip_sequence_is_serialized_by_possession_lock():
    engine = create_async_engine(PHASE2_DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    user_id, possession_id = await _async_seed_possession(engine)
    first_locked = asyncio.Event()
    release_first = asyncio.Event()

    async def allocate(*, wait_for_release: bool) -> int:
        async with session_factory.begin() as session:
            repository = PossessionTripRepository(session)
            sequence = await repository.next_trip_sequence(possession_id)
            assert sequence is not None
            now = datetime.now(timezone.utc)
            await repository.create(
                VehiclePossessionTrip(
                    possession_id=possession_id,
                    sequence_number=sequence,
                    status=VehiclePossessionTripStatus.ENCERRADA,
                    origin="Garagem",
                    purpose="Concorrência de sequência",
                    departure_at=now,
                    return_at=now + timedelta(minutes=1),
                    start_odometer_km=Decimal("100.0") + sequence,
                    end_odometer_km=Decimal("101.0") + sequence,
                    created_by_user_id=user_id,
                    closed_by_user_id=user_id,
                    closed_at=now + timedelta(minutes=1),
                )
            )
            if wait_for_release:
                first_locked.set()
                await release_first.wait()
            return sequence

    try:
        first_task = asyncio.create_task(allocate(wait_for_release=True))
        await first_locked.wait()
        second_task = asyncio.create_task(allocate(wait_for_release=False))
        await asyncio.sleep(0.15)
        assert not second_task.done()
        release_first.set()
        assert await first_task == 1
        assert await second_task == 2
    finally:
        release_first.set()
        await engine.dispose()
