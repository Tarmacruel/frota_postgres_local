from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Organization(Base):
    __tablename__ = "master_organizations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    departments: Mapped[list["Department"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        order_by="Department.name",
    )


class Department(Base):
    __tablename__ = "master_departments"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_master_departments_org_name"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_organizations.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    organization: Mapped["Organization"] = relationship(back_populates="departments")
    allocations: Mapped[list["Allocation"]] = relationship(
        back_populates="department",
        cascade="all, delete-orphan",
        order_by="Allocation.name",
    )

    @property
    def organization_name(self) -> str | None:
        return self.organization.name if self.organization else None


class Allocation(Base):
    __tablename__ = "master_allocations"
    __table_args__ = (UniqueConstraint("department_id", "name", name="uq_master_allocations_department_name"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    department_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_departments.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    department: Mapped["Department"] = relationship(back_populates="allocations")
    history_entries: Mapped[list["LocationHistory"]] = relationship(back_populates="allocation")

    @property
    def department_name(self) -> str | None:
        return self.department.name if self.department else None

    @property
    def organization_id(self) -> UUID | None:
        return self.department.organization_id if self.department else None

    @property
    def organization_name(self) -> str | None:
        if not self.department or not self.department.organization:
            return None
        return self.department.organization.name

    @property
    def display_name(self) -> str:
        segments = [self.organization_name, self.department_name, self.name]
        return " - ".join(segment for segment in segments if segment)
