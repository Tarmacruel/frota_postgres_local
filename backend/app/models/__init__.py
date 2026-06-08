from app.models.admin_notification import AdminNotification
from app.models.audit_log import AuditLog
from app.models.claim import Claim, ClaimStatus, ClaimType
from app.models.data_import import (
    DataImportBatch,
    DataImportBatchStatus,
    DataImportEntityType,
    DataImportRow,
    DataImportRowStatus,
    DataImportSuggestedAction,
)
from app.models.driver import Driver, DriverLicenseCategory
from app.models.fine import Fine, FineInfraction, FineStatus
from app.models.fuel_station import FuelStation, FuelStationUser
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.fleet_analytics_snapshot import FleetAnalyticsSnapshot
from app.models.master_data import Allocation, Department, Organization
from app.models.payment_process import (
    PaymentChecklistStatus,
    PaymentContract,
    PaymentContractAmendment,
    PaymentContractStatus,
    PaymentProcess,
    PaymentProcessChecklistItem,
    PaymentProcessKind,
    PaymentProcessReference,
    PaymentProcessReferenceType,
    PaymentProcessStage,
    PaymentProcessStageEvent,
    PaymentSupplier,
)
from app.models.user import User, UserRole
from app.models.user_permission import UserPermission
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
    "DataImportBatch",
    "DataImportBatchStatus",
    "DataImportEntityType",
    "DataImportRow",
    "DataImportRowStatus",
    "DataImportSuggestedAction",
    "Driver",
    "DriverLicenseCategory",
    "Fine",
    "FineInfraction",
    "FineStatus",
    "FuelStation",
    "FuelStationUser",
    "FuelSupply",
    "FuelSupplyOrder",
    "FuelSupplyOrderStatus",
    "FleetAnalyticsSnapshot",
    "Organization",
    "Department",
    "Allocation",
    "PaymentProcess",
    "PaymentProcessChecklistItem",
    "PaymentProcessKind",
    "PaymentProcessReference",
    "PaymentProcessReferenceType",
    "PaymentProcessStage",
    "PaymentProcessStageEvent",
    "PaymentChecklistStatus",
    "PaymentContract",
    "PaymentContractAmendment",
    "PaymentContractStatus",
    "PaymentSupplier",
    "User",
    "UserRole",
    "UserPermission",
    "Vehicle",
    "VehicleOwnershipType",
    "VehicleStatus",
    "VehicleType",
    "LocationHistory",
    "MaintenanceRecord",
    "VehiclePossession",
    "VehiclePossessionPhoto",
]
