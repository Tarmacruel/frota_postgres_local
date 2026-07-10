from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import CITEXT, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.cpf import mask_cpf
from app.core.permissions import default_permissions_for_role
from app.db.base import Base


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    PRODUCAO = "PRODUCAO"
    PADRAO = "PADRAO"
    POSTO = "POSTO"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("uq_users_cpf", "cpf", unique=True),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(CITEXT(), nullable=False, unique=True, index=True)
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=True,
        index=True,
    )
    cpf: Mapped[str | None] = mapped_column(String(11), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False, default=UserRole.PADRAO)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    organization: Mapped["Organization | None"] = relationship()
    fuel_station_links: Mapped[list["FuelStationUser"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    permission_entries: Mapped[list["UserPermission"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="UserPermission.module",
    )

    @property
    def organization_name(self) -> str | None:
        return self.organization.name if self.organization else None

    @property
    def cpf_masked(self) -> str | None:
        return mask_cpf(self.cpf)

    @property
    def has_cpf(self) -> bool:
        return bool(self.cpf)

    @property
    def must_register_cpf(self) -> bool:
        return not self.has_cpf

    @property
    def permissions(self) -> dict[str, dict[str, bool]]:
        permissions = default_permissions_for_role(self.role.value if self.role else "")
        for entry in self.permission_entries:
            permissions[entry.module] = {
                "can_view": entry.can_view,
                "can_create": entry.can_create,
                "can_edit": entry.can_edit,
                "can_delete": entry.can_delete,
            }
        return permissions
