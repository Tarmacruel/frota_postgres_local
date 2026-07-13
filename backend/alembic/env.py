from __future__ import annotations

from logging.config import fileConfig
from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy import create_engine
import logging

from app.core.config import settings
from app.db.base import Base
from app.models import audit_log, data_import, location_history, maintenance, possession, possession_trip, user, user_permission, vehicle  # noqa: F401

config = context.config

# Configure logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
else:
    logging.basicConfig()

target_metadata = Base.metadata


def _sync_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = _sync_database_url(settings.DATABASE_URL)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        transaction_per_migration=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    # PostgreSQL requires a commit before a newly-added enum value is queried by
    # a later revision. Keep each immutable revision in its own transaction so a
    # clean upgrade follows the same committed boundaries as staged production.
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        transaction_per_migration=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_engine(
        _sync_database_url(settings.DATABASE_URL),
        poolclass=pool.NullPool,
        echo=False,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
