"""Alembic environment.

Uses the application's SQLAlchemy Base metadata and connection settings so
migrations stay in sync with the models. The URL resolution order is:

1. ``sqlalchemy.url`` set programmatically (tests, explicit overrides)
2. ``DIRECT_DATABASE_URL`` (preferred for DDL against Neon)
3. ``DATABASE_URL`` (pooled runtime URL)
"""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the backend package importable regardless of the working directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app import models  # noqa: F401,E402  (registers tables on Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _resolve_database_url() -> str:
    provided = config.get_main_option("sqlalchemy.url")
    if provided and provided.strip():
        return provided.strip()
    url = settings.migration_database_url
    if not url:
        raise RuntimeError(
            "No database URL available for migrations. Set DATABASE_URL "
            "(or DIRECT_DATABASE_URL) in backend/.env."
        )
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (SQL emitted, no DB connection)."""
    url = _resolve_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database."""
    connectable = config.attributes.get("connection")

    if connectable is None:
        section = config.get_section(config.config_ini_section, {})
        section["sqlalchemy.url"] = _resolve_database_url()
        engine = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
        with engine.connect() as connection:
            _configure_and_run(connection)
        engine.dispose()
    else:
        _configure_and_run(connectable)


def _configure_and_run(connection) -> None:  # type: ignore[no-untyped-def]
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
