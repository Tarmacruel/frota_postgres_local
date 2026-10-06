from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from starlette.requests import Request

from app.api.deps import get_current_user, get_current_user_ready
from app.api.routes import auth as auth_routes
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db_session
from app.main import app
from app.models.user import UserRole
from app.repositories.user_feature_acknowledgement_repository import (
    UserFeatureAcknowledgementRepository,
)
from app.repositories.user_repository import UserRepository
from app.services.feature_guide_service import (
    FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    FeatureGuideService,
)


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _PermissionSession:
    async def execute(self, _statement):
        return _ScalarResult(None)


def _request_with_cookie(cookie: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/auth/me",
            "headers": [(b"cookie", cookie.encode("ascii"))],
        }
    )


def test_feature_guide_migration_has_current_parent_and_user_unique_key():
    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "0042_add_user_feature_acknowledgements.py"
    spec = importlib.util.spec_from_file_location("feature_guides_migration", migration_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "0042_feature_guides"
    assert module.down_revision == "0041_claim_attachments"


@pytest.mark.asyncio
async def test_feature_guide_service_returns_unacknowledged_state():
    service = FeatureGuideService(SimpleNamespace())
    service.acknowledgements.get = AsyncMock(return_value=None)

    state = await service.get_state(
        user_id=uuid4(),
        feature_key=FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    )

    assert state == {
        "feature_key": FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
        "acknowledged": False,
        "acknowledged_at": None,
    }


@pytest.mark.asyncio
async def test_feature_guide_acknowledgement_commits_and_is_returned():
    acknowledged_at = datetime(2026, 8, 6, 14, 30, tzinfo=timezone.utc)
    db = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock())
    service = FeatureGuideService(db)
    service.acknowledgements.acknowledge = AsyncMock(
        return_value=SimpleNamespace(acknowledged_at=acknowledged_at)
    )

    state = await service.acknowledge(
        user_id=uuid4(),
        feature_key=FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    )

    assert state == {
        "feature_key": FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
        "acknowledged": True,
        "acknowledged_at": acknowledged_at,
    }
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_feature_guide_acknowledgement_rolls_back_on_failure():
    db = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock())
    service = FeatureGuideService(db)
    service.acknowledgements.acknowledge = AsyncMock(side_effect=RuntimeError("database failure"))

    with pytest.raises(RuntimeError, match="database failure"):
        await service.acknowledge(
            user_id=uuid4(),
            feature_key=FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
        )

    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_repository_acknowledge_is_idempotent_when_unique_row_exists():
    acknowledgement = SimpleNamespace(acknowledged_at=datetime.now(timezone.utc))
    db = SimpleNamespace(execute=AsyncMock(return_value=_ScalarResult(None)))
    repository = UserFeatureAcknowledgementRepository(db)
    repository.get = AsyncMock(return_value=acknowledgement)

    result = await repository.acknowledge(
        user_id=uuid4(),
        feature_key=FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    )

    assert result is acknowledgement
    repository.get.assert_awaited_once()
    statement = db.execute.await_args.args[0]
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT ON CONSTRAINT uq_user_feature_acknowledgements_user_feature DO NOTHING" in compiled


@pytest.mark.asyncio
async def test_get_current_user_reads_the_configured_cookie_name(monkeypatch):
    user_id = uuid4()
    expected_user = SimpleNamespace(id=user_id)
    token = create_access_token(subject=str(user_id), role="ADMIN")
    monkeypatch.setattr(settings, "COOKIE_NAME", "frota_homolog_access")
    lookup = AsyncMock(return_value=expected_user)
    monkeypatch.setattr(UserRepository, "get_by_id", lookup)

    user = await get_current_user(
        request=_request_with_cookie(f"access_token=ignored; frota_homolog_access={token}"),
        db=SimpleNamespace(),
    )

    assert user is expected_user
    lookup.assert_awaited_once_with(user_id)


@pytest.mark.asyncio
async def test_get_current_user_does_not_fall_back_to_default_cookie_name(monkeypatch):
    token = create_access_token(subject=str(uuid4()), role="ADMIN")
    monkeypatch.setattr(settings, "COOKIE_NAME", "frota_homolog_access")
    lookup = AsyncMock()
    monkeypatch.setattr(UserRepository, "get_by_id", lookup)

    with pytest.raises(HTTPException) as exc:
        await get_current_user(
            request=_request_with_cookie(f"access_token={token}"),
            db=SimpleNamespace(),
        )

    assert exc.value.status_code == 401
    lookup.assert_not_awaited()


@pytest.mark.asyncio
async def test_feature_guide_endpoints_require_fuel_order_creation_permission(client, monkeypatch):
    class FakeGuideService:
        def __init__(self, _db):
            pass

        async def get_state(self, *, user_id, feature_key):
            return {"feature_key": feature_key, "acknowledged": False, "acknowledged_at": None}

        async def acknowledge(self, *, user_id, feature_key):
            return {
                "feature_key": feature_key,
                "acknowledged": True,
                "acknowledged_at": datetime(2026, 8, 6, tzinfo=timezone.utc),
            }

    current = {
        "user": SimpleNamespace(
            id=uuid4(),
            role=UserRole.ADMIN,
            must_change_password=False,
            cpf="52998224725",
        )
    }

    async def override_current_user_ready():
        return current["user"]

    async def override_db():
        yield _PermissionSession()

    monkeypatch.setattr(auth_routes, "FeatureGuideService", FakeGuideService)
    app.dependency_overrides[get_current_user_ready] = override_current_user_ready
    app.dependency_overrides[get_db_session] = override_db
    try:
        state_response = await client.get("/api/auth/feature-guides/fuel-supply-orders-batch-v1")
        assert state_response.status_code == 200
        assert state_response.json()["acknowledged"] is False

        acknowledgement_response = await client.post(
            "/api/auth/feature-guides/fuel-supply-orders-batch-v1/acknowledge"
        )
        assert acknowledgement_response.status_code == 200
        assert acknowledgement_response.json()["acknowledged"] is True

        current["user"] = SimpleNamespace(
            id=uuid4(),
            role=UserRole.PADRAO,
            must_change_password=False,
            cpf="52998224725",
        )
        forbidden_response = await client.get("/api/auth/feature-guides/fuel-supply-orders-batch-v1")
        assert forbidden_response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user_ready, None)
        app.dependency_overrides.pop(get_db_session, None)
