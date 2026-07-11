import pytest


@pytest.mark.asyncio
async def test_csrf_blocks_authenticated_unsafe_request_without_token(client):
    client.cookies.set("access_token", "fake-token")

    response = await client.post("/api/auth/logout")

    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


@pytest.mark.asyncio
async def test_csrf_blocks_authenticated_unsafe_request_with_incorrect_token(client):
    client.cookies.set("access_token", "fake-token")
    client.cookies.set("csrf_token", "csrf-value")

    response = await client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": "other-value", "Origin": "http://localhost:8000"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_TOKEN_INVALID"


@pytest.mark.asyncio
async def test_csrf_blocks_authenticated_request_from_unauthorized_origin(client):
    client.cookies.set("access_token", "fake-token")
    client.cookies.set("csrf_token", "csrf-value")

    response = await client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": "csrf-value", "Origin": "https://evil.example"},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_ORIGIN_INVALID"


@pytest.mark.asyncio
async def test_csrf_blocks_authenticated_request_without_origin_or_referer(client):
    client.cookies.set("access_token", "fake-token")
    client.cookies.set("csrf_token", "csrf-value")

    response = await client.post("/api/auth/logout", headers={"X-CSRF-Token": "csrf-value"})

    assert response.status_code == 403
    assert response.json()["code"] == "CSRF_ORIGIN_INVALID"


@pytest.mark.asyncio
async def test_csrf_allows_authenticated_unsafe_request_with_matching_token(client):
    client.cookies.set("access_token", "fake-token")
    client.cookies.set("csrf_token", "csrf-value")

    response = await client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": "csrf-value", "Origin": "http://localhost:8000"},
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_csrf_accepts_allowed_referer_when_origin_is_absent(client):
    client.cookies.set("access_token", "fake-token")
    client.cookies.set("csrf_token", "csrf-value")

    response = await client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": "csrf-value", "Referer": "http://localhost:8000/possession"},
    )

    assert response.status_code == 200
