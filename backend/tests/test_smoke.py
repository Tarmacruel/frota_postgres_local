import pytest


@pytest.mark.asyncio
async def test_root(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    assert resp.json()["message"] == "API da Frota PMTF"


@pytest.mark.asyncio
async def test_openapi_contains_new_routes(client):
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    assert "/api/maintenance" in paths
    assert "/api/maintenance/{record_id}" in paths
    assert "/api/possession" in paths
    assert "/api/possession/active" in paths
    assert "/api/possession/{possession_id}/end" in paths
    assert "/api/vehicles/{vehicle_id}/current-driver" in paths
