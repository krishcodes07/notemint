"""Database package: engine, session factory, and FastAPI dependencies."""

from app.db.base import Base
from app.db.dependencies import get_db
from app.db.session import (
    DatabaseNotConfiguredError,
    check_database_connection,
    get_engine,
    get_session_factory,
    reset_database_resources,
    session_scope,
)

__all__ = [
    "Base",
    "DatabaseNotConfiguredError",
    "check_database_connection",
    "get_db",
    "get_engine",
    "get_session_factory",
    "reset_database_resources",
    "session_scope",
]
