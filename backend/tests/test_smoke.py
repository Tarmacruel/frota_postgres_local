import pytest


@pytest.mark.asyncio
async def test_root(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type:
        assert resp.json()["message"] == "API da Frota PMTF"
    else:
        assert "text/html" in content_type
        assert "<div id=\"root\"></div>" in resp.text


@pytest.mark.asyncio
async def test_openapi_contains_new_routes(client):
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    payload = resp.json()
    paths = payload["paths"]
    assert "/api/claims" in paths
    assert "/api/claims/{claim_id}" in paths
    assert "/api/drivers" in paths
    assert "/api/drivers/active" in paths
    assert "/api/drivers/{driver_id}" in paths
    assert "/api/maintenance" in paths
    assert "/api/maintenance/paginated" in paths
    assert "/api/master-data/catalog" in paths
    assert "/api/maintenance/{record_id}" in paths
    assert "/api/possession" in paths
    assert "/api/possession/active" in paths
    assert "/api/possession/paginated" in paths
    assert "/api/possession/{possession_id}" in paths
    assert "/api/possession/{possession_id}/document" in paths
    assert "/api/possession/{possession_id}/photo" in paths
    assert "/api/possession/{possession_id}/photos/{photo_id}" in paths
    assert "/api/possession/{possession_id}/end" in paths
    assert "/api/search" in paths
    assert "/api/fuel-stations" in paths
    assert "/api/fuel-stations/{fuel_station_id}/users" in paths
    assert "/api/fuel-supplies" in paths
    assert "/api/fuel-supplies/{supply_id}/receipt" in paths
    assert "/api/fuel-supply-orders" in paths
    assert "/api/fuel-supply-orders/{order_id}" in paths
    assert "/api/fuel-supply-orders/{order_id}/confirm" in paths
    assert "/api/fuel-supply-orders/{order_id}/cancel" in paths
    assert "/api/public/fuel-supply-orders/{validation_code}" in paths
    assert "/api/vehicles/paginated" in paths
    assert "/api/vehicles/{vehicle_id}/claims" in paths
    assert "/api/vehicles/{vehicle_id}/current-driver" in paths
    assert "/api/vehicles/{vehicle_id}/historico" in paths

    schemas = payload["components"]["schemas"]
    vehicle_update = schemas["VehicleUpdate"]
    assert "edit_reason" in vehicle_update["properties"]
    assert "edit_reason" in vehicle_update["required"]

    vehicle_history_event = schemas["VehicleHistoryEventOut"]
    assert "event_type" in vehicle_history_event["properties"]
    assert "justification" in vehicle_history_event["properties"]

    fuel_supply_order_create = schemas["FuelSupplyOrderCreate"]
    assert "fuel_station_id" in fuel_supply_order_create["required"]

    fuel_supply_order = schemas["FuelSupplyOrderOut"]
    assert "request_number" in fuel_supply_order["properties"]
    assert "validation_code" in fuel_supply_order["properties"]
    assert "public_validation_path" in fuel_supply_order["properties"]
    assert "driver_name" in fuel_supply_order["properties"]
    assert "fuel_station_name" in fuel_supply_order["properties"]

    public_fuel_supply_order = schemas["FuelSupplyOrderPublicOut"]
    assert "validation_code" in public_fuel_supply_order["properties"]
    assert "public_validation_path" in public_fuel_supply_order["properties"]
