from app.models.admin_notification import AdminNotification
from app.models.audit_log import AuditLog
from app.models.claim import Claim, ClaimStatus, ClaimType
from app.models.driver import Driver, DriverLicenseCategory
from app.models.fine import Fine, FineStatus
from app.models.fuel_station import FuelStation
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.fleet_analytics_snapshot import FleetAnalyticsSnapshot
from app.models.master_data import Allocation, Department, Organization
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleOwnershipType, VehicleStatus, VehicleType
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession
from app.models.possession_photo import VehiclePossessionPhoto

__all__ = [
    "AdminNotification",
    "AuditLog",
    "Claim",
    "ClaimStatus",
    "ClaimType",
    "Driver",
    "DriverLicenseCategory",
    "Fine",
    "FineStatus",
    "FuelStation",
    "FuelSupply",
    "FuelSupplyOrder",
    "FuelSupplyOrderStatus",
    "FleetAnalyticsSnapshot",
    "Organization",
    "Department",
    "Allocation",
    "User",
    "UserRole",
    "Vehicle",
    "VehicleOwnershipType",
    "VehicleStatus",
    "VehicleType",
    "LocationHistory",
    "MaintenanceRecord",
    "VehiclePossession",
    "VehiclePossessionPhoto",
]
