import pytest


@pytest.mark.asyncio
async def test_csrf_blocks_authenticated_unsafe_request_without_token(client):
    client.cookies.set("access_token", "fake-token")

    response = await client.post("/api/auth/logout")

    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]


@pytest.mark.asyncio
async def test_csrf_allows_authenticated_unsafe_request_with_matching_token(client):
    client.cookies.set("access_token", "fake-token")
    client.cookies.set("csrf_token", "csrf-value")

    response = await client.post("/api/auth/logout", headers={"X-CSRF-Token": "csrf-value"})

    assert response.status_code == 200
