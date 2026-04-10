from app.models.audit_log import AuditLog
from app.models.master_data import Allocation, Department, Organization
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleOwnershipType, VehicleStatus
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession

__all__ = [
    "AuditLog",
    "Organization",
    "Department",
    "Allocation",
    "User",
    "UserRole",
    "Vehicle",
    "VehicleOwnershipType",
    "VehicleStatus",
    "LocationHistory",
    "MaintenanceRecord",
    "VehiclePossession",
]
