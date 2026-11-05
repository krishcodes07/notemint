"""Declarative SQLAlchemy 2.0 base shared by all models."""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Stable, predictable constraint names so Alembic autogenerate diffs stay
# clean across environments.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Root declarative base with a shared metadata naming convention."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
