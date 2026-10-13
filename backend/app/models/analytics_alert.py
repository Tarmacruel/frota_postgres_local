"""Persistent analytical cases; operational fuel flags remain independent."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class AnalyticsAlertCase(Base):
    __tablename__ = 'analytics_alert_cases'
    __table_args__ = (
        CheckConstraint("status IN ('NEW','IN_REVIEW','RESOLVED','IGNORED')", name='ck_alert_status'),
        CheckConstraint("severity IN ('LOW','MEDIUM','HIGH')", name='ck_alert_severity'),
        CheckConstraint("source_type = 'fuel_supply' AND rule_key IN ('capacity','odometer','close','consumption','price')", name='ck_alert_source_rule'),
        CheckConstraint('version >= 1 AND evaluation_count >= 1 AND fingerprint_version = 1', name='ck_alert_counters'),
        Index('ix_alert_scope_queue', 'organization_id', 'status', 'last_detected_at', 'id'),
        Index('ix_alert_source', 'source_type', 'source_id'),
    )
    id: Mapped[UUID] = mapped_column(PGUUID, primary_key=True, server_default=text('gen_random_uuid()'))
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    fingerprint_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_id: Mapped[UUID] = mapped_column(PGUUID, nullable=False)
    rule_key: Mapped[str] = mapped_column(String(40), nullable=False)
    rule_version: Mapped[str] = mapped_column(String(40), nullable=False)
    vehicle_id: Mapped[UUID | None] = mapped_column(PGUUID)
    driver_id: Mapped[UUID | None] = mapped_column(PGUUID)
    organization_id: Mapped[UUID | None] = mapped_column(PGUUID)
    severity: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    first_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    evaluation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    latest_evidence: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AnalyticsAlertEvent(Base):
    __tablename__ = 'analytics_alert_events'
    __table_args__ = (
        CheckConstraint("event_type IN ('DETECTED','REEVALUATED','STATUS_CHANGED')", name='ck_alert_event_type'),
        CheckConstraint("(event_type = 'STATUS_CHANGED' AND from_status IS NOT NULL AND to_status IS NOT NULL AND ((from_status IN ('NEW','IN_REVIEW') AND to_status IN ('RESOLVED','IGNORED')) OR (from_status IN ('NEW','RESOLVED','IGNORED') AND to_status = 'IN_REVIEW'))) OR (event_type IN ('DETECTED','REEVALUATED') AND from_status IS NULL AND to_status IS NULL)", name='ck_alert_event_shape'),
        CheckConstraint("event_type <> 'STATUS_CHANGED' OR (to_status = 'IN_REVIEW' AND from_status = 'NEW') OR (reason IS NOT NULL AND length(trim(reason)) > 0)", name='ck_alert_event_reason'),
        Index('ix_alert_event_timeline', 'case_id', 'created_at', 'id'),
    )
    id: Mapped[UUID] = mapped_column(PGUUID, primary_key=True, server_default=text('gen_random_uuid()'))
    case_id: Mapped[UUID] = mapped_column(PGUUID, ForeignKey('analytics_alert_cases.id', ondelete='RESTRICT'), nullable=False)
    event_type: Mapped[str] = mapped_column(String(24), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(12))
    to_status: Mapped[str | None] = mapped_column(String(12))
    actor_user_id: Mapped[UUID | None] = mapped_column(PGUUID, ForeignKey('users.id', ondelete='SET NULL'))
    actor_label: Mapped[str] = mapped_column(String(150), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    rule_version: Mapped[str] = mapped_column(String(40), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False)
    evaluation_context: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))


class AnalyticsAlertRequest(Base):
    __tablename__ = 'analytics_alert_requests'
    __table_args__ = (
        Index('uq_alert_request_key', 'actor_user_id', 'operation', 'idempotency_key', unique=True),
        CheckConstraint("operation IN ('RECONCILE','STATUS_CHANGE')", name='ck_alert_request_operation'),
        Index('ix_alert_request_created', 'created_at'),
    )
    id: Mapped[UUID] = mapped_column(PGUUID, primary_key=True, server_default=text('gen_random_uuid()'))
    actor_user_id: Mapped[UUID] = mapped_column(PGUUID, ForeignKey('users.id', ondelete='RESTRICT'), nullable=False)
    operation: Mapped[str] = mapped_column(String(24), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text('NOW()'))
