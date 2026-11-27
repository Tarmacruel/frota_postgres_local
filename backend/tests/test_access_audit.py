from datetime import datetime, timezone
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.core.request_context import RequestAuditContext, reset_request_audit_context, set_request_audit_context
from app.services.access_audit_service import record_access
from app.services.ip_geolocation import locate_audit_ip


@pytest.mark.asyncio
async def test_failed_login_keeps_attempt_separate_from_authenticated_identity():
    records = []
    db = SimpleNamespace(add=records.append, commit=AsyncMock())
    context = RequestAuditContext(
        request_id="access-request-01",
        ip_address="8.8.8.8",
        user_agent="test browser",
        method="POST",
        path="/api/auth/login",
        timestamp=datetime.now(timezone.utc),
    )
    token = set_request_audit_context(context)
    try:
        await record_access(db, action="LOGIN_FAILURE", http_status=401, attempted_email="attempt@example.test")
    finally:
        reset_request_audit_context(token)

    assert records[0].actor_user_id is None
    assert records[0].actor_email is None
    assert records[0].entity_label == "attempt@example.test"
    assert records[0].details == {"http_status": 401, "request_context": context.as_dict()}
    db.commit.assert_awaited_once()


def test_geolocation_handles_private_missing_and_local_database(monkeypatch, tmp_path):
    path = tmp_path / "local.mmdb"
    monkeypatch.setattr(settings, "AUDIT_IP_CITY_MMDB", path)
    assert locate_audit_ip("192.168.1.10") == {"status": "non_public"}
    assert locate_audit_ip("invalid") == {"status": "no_ip"}
    assert locate_audit_ip("8.8.8.8") == {"status": "database_unavailable"}
    path.touch()

    class Reader:
        def __enter__(self):
            return self

        def __exit__(self, *_error):
            return None

        def metadata(self):
            return SimpleNamespace(build_epoch=1761955200)

        def get(self, address):
            assert address == "8.8.8.8"
            return {
                "city": {"names": {"pt-BR": "Cidade de teste"}},
                "country": {"iso_code": "BR"},
                "subdivisions": [{"names": {"en": "Bahia"}}],
                "location": {"latitude": -17.5, "longitude": -39.75, "accuracy_radius": 100},
            }

    monkeypatch.setitem(sys.modules, "maxminddb", SimpleNamespace(open_database=lambda _: Reader()))
    result = locate_audit_ip("::ffff:8.8.8.8")
    assert result["status"] == "located"
    assert result["city"] == "Cidade de teste"
    assert result["region"] == "Bahia"
    assert result["radius_km"] == 100
    assert result["latitude"] == -17.5
