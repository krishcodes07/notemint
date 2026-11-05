"""Application user model.

Clerk remains the authentication provider: PostgreSQL only stores
application-level profile data keyed by the verified Clerk user id.
No passwords are ever stored here.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    """A NoteMint application user, keyed by their verified Clerk id."""

    __tablename__ = "users"

    clerk_user_id: Mapped[str] = mapped_column(
        String(length=64),
        primary_key=True,
        comment="Verified Clerk `sub` claim (user_xxx)",
    )
    display_name: Mapped[str | None] = mapped_column(
        String(length=255),
        nullable=True,
        comment="Display name when provided by a trusted source",
    )
    email: Mapped[str | None] = mapped_column(
        String(length=320),
        nullable=True,
        comment="Email only when obtained from a trusted source",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    documents: Mapped[list["Document"]] = relationship(  # noqa: F821
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User clerk_user_id={self.clerk_user_id!r}>"
