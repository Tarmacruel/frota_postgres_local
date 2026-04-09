from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession

__all__ = [
    "User",
    "UserRole",
    "Vehicle",
    "VehicleStatus",
    "LocationHistory",
    "MaintenanceRecord",
    "VehiclePossession",
]
