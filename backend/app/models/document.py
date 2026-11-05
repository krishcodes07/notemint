"""Document metadata model (foundation for Phase 5+ PDF uploads).

Rows describe files stored in Neon Object Storage; the bytes themselves
never live in PostgreSQL. No upload/processing routes exist yet.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DocumentStatus(str, enum.Enum):
    """Processing lifecycle of an uploaded document."""

    UPLOADED = "uploaded"
    EXTRACTING = "extracting"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


_STATUS_IN_LIST = ", ".join(
    f"'{member.value}'" for member in DocumentStatus
)


class Document(Base):
    """Metadata for one uploaded (or generated) document."""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            f"status IN ({_STATUS_IN_LIST})",
            name="document_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Server-generated document id",
    )
    clerk_user_id: Mapped[str] = mapped_column(
        String(length=64),
        ForeignKey("users.clerk_user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Owner (verified Clerk user id)",
    )
    original_filename: Mapped[str] = mapped_column(
        String(length=512),
        nullable=False,
        comment="Filename as supplied at upload time",
    )
    storage_key: Mapped[str] = mapped_column(
        String(length=1024),
        nullable=False,
        unique=True,
        comment="Object Storage key (backend-generated, never user-supplied)",
    )
    mime_type: Mapped[str] = mapped_column(
        String(length=127),
        nullable=False,
        comment="File content type, e.g. application/pdf",
    )
    file_size_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="File size in bytes",
    )
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(
            DocumentStatus,
            name="document_status",
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=DocumentStatus.UPLOADED,
        server_default=DocumentStatus.UPLOADED.value,
        comment="Processing status",
    )
    page_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Page count after extraction, when known",
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

    owner: Mapped[User] = relationship(back_populates="documents")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Document id={self.id} status={self.status}>"
