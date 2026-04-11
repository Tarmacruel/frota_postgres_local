from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ClaimStatus(str, enum.Enum):
    ABERTO = "ABERTO"
    EM_ANALISE = "EM_ANALISE"
    ENCERRADO = "ENCERRADO"


class ClaimType(str, enum.Enum):
    COLISAO = "COLISAO"
    ROUBO = "ROUBO"
    FURTO = "FURTO"
    AVERIA = "AVERIA"
    OUTRO = "OUTRO"


class Claim(Base):
    __tablename__ = "claims"
    __table_args__ = (
        Index("idx_claims_vehicle", "vehicle_id"),
        Index("idx_claims_driver", "driver_id"),
        Index("idx_claims_data", "data_ocorrencia"),
        Index("idx_claims_status", "status"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        nullable=False,
    )
    driver_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("drivers.id", ondelete="SET NULL"),
        nullable=True,
    )
    data_ocorrencia: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tipo: Mapped[ClaimType] = mapped_column(Enum(ClaimType, name="claim_type"), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    local: Mapped[str] = mapped_column(String(200), nullable=False)
    boletim_ocorrencia: Mapped[str | None] = mapped_column(String(50), nullable=True)
    valor_estimado: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[ClaimStatus] = mapped_column(
        Enum(ClaimStatus, name="claim_status"),
        nullable=False,
        server_default=text("'ABERTO'"),
    )
    justificativa_encerramento: Mapped[str | None] = mapped_column(Text, nullable=True)
    anexos: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="claims")
    driver: Mapped["Driver | None"] = relationship(back_populates="claims")
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
