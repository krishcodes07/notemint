"""Engine, session factory, and connection lifecycle management.

Resources are created lazily on first use — importing this module never
opens a database connection. Alembic owns schema changes; this module never
calls ``Base.metadata.create_all()`` in application code.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from functools import lru_cache
from typing import Iterator

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseNotConfiguredError(RuntimeError):
    """Raised when no DATABASE_URL is available."""


class DatabaseUnavailableError(RuntimeError):
    """Raised when a database operation fails (connectivity, auth, ...)."""


def _require_database_url() -> str:
    url = settings.database_url.strip()
    if not url:
        raise DatabaseNotConfiguredError(
            "DATABASE_URL is not configured. Set it in backend/.env."
        )
    return url


def build_engine(url: str) -> Engine:
    """Create an engine with pooling appropriate for a serverless Postgres.

    Connections are established lazily by SQLAlchemy; nothing here dials
    the database. ``pool_pre_ping`` recycles connections dropped by Neon's
    pooler/compute suspend. Pool sizing options only apply to backends that
    support them (SQLite's memory/single-connection pools reject them).
    """
    from sqlalchemy.engine import make_url

    kwargs: dict[str, object] = {
        "pool_pre_ping": True,
        "future": True,
    }
    if make_url(url).get_backend_name() == "postgresql":
        kwargs.update(
            pool_size=5,
            max_overflow=10,
            pool_recycle=1800,
        )
    return create_engine(url, **kwargs)


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Return the process-wide engine (created on first use)."""
    return build_engine(_require_database_url())


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    """Return the session factory bound to the shared engine."""
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False)


def reset_database_resources() -> None:
    """Dispose the engine and clear caches (tests / reconfiguration)."""
    try:
        get_engine().dispose()
    except DatabaseNotConfiguredError:
        pass
    get_engine.cache_clear()
    get_session_factory.cache_clear()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope: commit on success, rollback on error, always close."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def check_database_connection() -> None:
    """Lightweight connectivity probe (``SELECT 1``).

    Raises:
        DatabaseNotConfiguredError: no DATABASE_URL configured.
        DatabaseUnavailableError: the connection or query failed.
    """
    engine = get_engine()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        # Never log or propagate connection strings / credentials.
        logger.warning("Database health check failed: %s", type(exc).__name__)
        raise DatabaseUnavailableError("database unreachable") from exc
