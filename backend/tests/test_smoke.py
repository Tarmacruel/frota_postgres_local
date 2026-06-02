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
    assert "/api/data-imports" in paths
    assert "/api/data-imports/upload" in paths
    assert "/api/data-imports/{batch_id}" in paths
    assert "/api/data-imports/{batch_id}/rows" in paths
    assert "/api/data-imports/{batch_id}/rows/{row_id}" in paths
    assert "/api/data-imports/{batch_id}/apply" in paths
    assert "/api/data-imports/{batch_id}/export" in paths
    assert "/api/data-imports/templates/{entity_type}" in paths
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
    assert "delete" in paths["/api/possession/{possession_id}"]
    assert "/api/possession/{possession_id}/document" in paths
    assert "/api/possession/{possession_id}/documents/loan-term" in paths
    assert "/api/possession/{possession_id}/documents/return-term" in paths
    assert "/api/possession/{possession_id}/photo" in paths
    assert "/api/possession/{possession_id}/photos/{photo_id}" in paths
    assert "/api/possession/{possession_id}/end" in paths
    assert "/api/public/possession-terms/loan/{validation_code}" in paths
    assert "/api/public/possession-terms/return/{validation_code}" in paths
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
    assert "/api/users/{user_id}/permissions" in paths

    vehicle_history_params = {
        param["name"]
        for param in paths["/api/vehicles/{vehicle_id}/historico"]["get"].get("parameters", [])
    }
    assert {"start_date", "end_date"}.issubset(vehicle_history_params)

    schemas = payload["components"]["schemas"]
    vehicle_update = schemas["VehicleUpdate"]
    assert "edit_reason" in vehicle_update["properties"]
    assert "edit_reason" in vehicle_update["required"]
    assert "renavam" in vehicle_update["properties"]
    assert "fuel_type" in schemas["VehicleOut"]["properties"]

    data_import_batch = schemas["DataImportBatchOut"]
    assert "summary" in data_import_batch["properties"]
    assert "official_extra_fields" in data_import_batch["properties"]
    data_import_row = schemas["DataImportRowOut"]
    assert "mapped_data" in data_import_row["properties"]
    assert "triage_extra_data" in data_import_row["properties"]

    vehicle_history_event = schemas["VehicleHistoryEventOut"]
    assert "event_type" in vehicle_history_event["properties"]
    assert "justification" in vehicle_history_event["properties"]

    fuel_supply_order_create = schemas["FuelSupplyOrderCreate"]
    assert "fuel_station_id" in fuel_supply_order_create["required"]
    assert "driver_id" not in fuel_supply_order_create["properties"]
    assert "requester_contact" not in fuel_supply_order_create["properties"]
    assert "max_amount" not in fuel_supply_order_create["properties"]

    fuel_supply = schemas["FuelSupplyOut"]
    assert "fuel_type" in fuel_supply["properties"]
    assert "additive_type" in fuel_supply["properties"]
    assert "additive_quantity_liters" in fuel_supply["properties"]

    fuel_station = schemas["FuelStationOut"]
    assert "phone" in fuel_station["properties"]
    assert "latitude" in fuel_station["properties"]
    assert "longitude" in fuel_station["properties"]

    fuel_supply_order = schemas["FuelSupplyOrderOut"]
    assert "request_number" in fuel_supply_order["properties"]
    assert "validation_code" in fuel_supply_order["properties"]
    assert "public_validation_path" in fuel_supply_order["properties"]
    assert "driver_name" in fuel_supply_order["properties"]
    assert "driver_contact" in fuel_supply_order["properties"]
    assert "fuel_station_name" in fuel_supply_order["properties"]
    assert "fuel_station_phone" in fuel_supply_order["properties"]
    assert "fuel_station_latitude" in fuel_supply_order["properties"]
    assert "fuel_station_longitude" in fuel_supply_order["properties"]
    assert "fuel_station_maps_url" in fuel_supply_order["properties"]
    assert "created_by_contact" in fuel_supply_order["properties"]

    public_fuel_supply_order = schemas["FuelSupplyOrderPublicOut"]
    assert "validation_code" in public_fuel_supply_order["properties"]
    assert "public_validation_path" in public_fuel_supply_order["properties"]
    assert "driver_name" not in public_fuel_supply_order["properties"]
    assert "driver_contact" not in public_fuel_supply_order["properties"]
    assert "fuel_station_phone" in public_fuel_supply_order["properties"]
    assert "fuel_station_latitude" in public_fuel_supply_order["properties"]
    assert "fuel_station_longitude" in public_fuel_supply_order["properties"]
    assert "fuel_station_maps_url" in public_fuel_supply_order["properties"]
    assert "created_by_contact" not in public_fuel_supply_order["properties"]
    assert "max_amount" not in public_fuel_supply_order["properties"]

    possession = schemas["PossessionOut"]
    assert "loan_term_available" in possession["properties"]
    assert "loan_term_url" in possession["properties"]
    assert "return_term_available" in possession["properties"]
    assert "return_term_url" in possession["properties"]
    assert "loan_term_validation_code" in possession["properties"]
    assert "loan_term_public_validation_path" in possession["properties"]
    assert "return_term_validation_code" in possession["properties"]
    assert "return_term_public_validation_path" in possession["properties"]
    assert "vehicle_description" in possession["properties"]
    assert "document_available" in possession["properties"]

    public_possession_term = schemas["PossessionTermPublicOut"]
    assert "validation_code" in public_possession_term["properties"]
    assert "public_validation_path" in public_possession_term["properties"]
    assert "driver_document_masked" in public_possession_term["properties"]

    current_user = schemas["CurrentUserOut"]
    assert "must_change_password" in current_user["properties"]
    assert "permissions" in current_user["properties"]

    user_create = schemas["UserCreate"]
    assert "organization_id" in user_create["properties"]
    assert "organization_id" in user_create["required"]

    user_update = schemas["UserUpdate"]
    assert "organization_id" in user_update["properties"]

    user_out = schemas["UserOut"]
    assert "must_change_password" in user_out["properties"]
    assert "organization_id" in user_out["properties"]
    assert "organization_name" in user_out["properties"]
    assert "permissions" in user_out["properties"]

    permission_flags = schemas["PermissionFlags"]
    assert {"can_view", "can_create", "can_edit", "can_delete"}.issubset(permission_flags["properties"])

    user_permissions_update = schemas["UserPermissionsUpdate"]
    assert "permissions" in user_permissions_update["properties"]

    user_permissions_out = schemas["UserPermissionsOut"]
    assert "permissions" in user_permissions_out["properties"]

    driver_create = schemas["DriverCreate"]
    assert "organization_id" in driver_create["properties"]
    assert "organization_id" in driver_create["required"]
    assert "cnh_numero" in driver_create["properties"]
    assert "matricula" in driver_create["properties"]

    driver_update = schemas["DriverUpdate"]
    assert "organization_id" in driver_update["properties"]

    driver_out = schemas["DriverOut"]
    assert "organization_id" in driver_out["properties"]
    assert "organization_name" in driver_out["properties"]

    assert "/api/auth/change-password" in paths
