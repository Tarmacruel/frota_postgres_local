from datetime import timezone
from uuid import UUID

import pytest
from starlette.requests import Request

from app.core.request_context import build_request_audit_context, resolve_client_ip


def _request(*, client_ip: str, forwarded_for: str | None = None, user_agent: str = "pytest") -> Request:
    headers = [(b"user-agent", user_agent.encode())]
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/health",
            "raw_path": b"/api/health",
            "query_string": b"",
            "headers": headers,
            "client": (client_ip, 12345),
            "server": ("test", 80),
        }
    )


@pytest.mark.asyncio
async def test_request_id_is_generated_and_security_headers_are_returned(client):
    response = await client.get("/api/health")

    UUID(response.headers["X-Request-ID"])
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.asyncio
async def test_valid_external_request_id_is_preserved(client):
    response = await client.get("/api/health", headers={"X-Request-ID": "trace-12345678"})

    assert response.headers["X-Request-ID"] == "trace-12345678"


@pytest.mark.asyncio
async def test_invalid_external_request_id_is_replaced(client):
    supplied = "invalid value/with spaces"
    response = await client.get("/api/health", headers={"X-Request-ID": supplied})

    generated = response.headers["X-Request-ID"]
    UUID(generated)
    assert generated != supplied


@pytest.mark.asyncio
async def test_error_response_contains_matching_request_id_without_validation_input(client):
    response = await client.post(
        "/api/auth/login",
        json={"email": "operator@example.test"},
        headers={"X-Request-ID": "error-12345678"},
    )

    assert response.status_code == 422
    assert response.json()["request_id"] == "error-12345678"
    assert response.headers["X-Request-ID"] == "error-12345678"
    assert all("input" not in item for item in response.json()["detail"])


@pytest.mark.asyncio
async def test_unauthenticated_response_is_consistent_and_contains_request_id(client):
    response = await client.get(
        "/api/auth/me",
        headers={"X-Request-ID": "unauth-12345678"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Não autenticado", "request_id": "unauth-12345678"}
    assert response.headers["X-Request-ID"] == "unauth-12345678"


def test_untrusted_peer_cannot_spoof_client_ip_with_forwarded_header():
    request = _request(client_ip="203.0.113.10", forwarded_for="198.51.100.20")

    assert resolve_client_ip(request, trusted_proxy_networks=["10.0.0.0/8"]) == "203.0.113.10"


def test_trusted_proxy_chain_uses_first_untrusted_hop_from_the_right():
    request = _request(client_ip="10.0.0.2", forwarded_for="198.51.100.20, 10.0.0.1")

    assert resolve_client_ip(request, trusted_proxy_networks=["10.0.0.0/8"]) == "198.51.100.20"


def test_audit_context_limits_user_agent_and_uses_utc():
    request = _request(client_ip="127.0.0.1", user_agent="agent\x00" + ("x" * 400))

    context = build_request_audit_context(request)

    assert "\x00" not in context.user_agent
    assert len(context.user_agent) == 256
    assert context.timestamp.tzinfo == timezone.utc
