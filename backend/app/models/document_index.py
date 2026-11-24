"""SQLAlchemy model tracking vector indexing state and lifecycle (Phase 10)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document


class IndexStatus(str, enum.Enum):
    """Vector index lifecycle status."""

    PENDING = "pending"
    INDEXING = "indexing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentIndex(Base):
    """Vector indexing status and metadata per document."""

    __tablename__ = "document_indexes"
    __table_args__ = (
        Index("ix_document_indexes_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the index record",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
        comment="One-to-one foreign key to documents table",
    )
    status: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        server_default=IndexStatus.PENDING.value,
        comment="Indexing status: pending, indexing, completed, failed",
    )
    embedding_provider: Mapped[str] = mapped_column(
        String(length=64),
        nullable=False,
        server_default="jina",
        comment="Provider used for vector embeddings (e.g. jina, local, gateway)",
    )
    embedding_model: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        comment="Embedding model identifier",
    )
    embedding_dimensions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="1024",
        comment="Embedding vector dimension",
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Number of chunks successfully indexed",
    )
    indexed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when indexing completed",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Error message if indexing failed",
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

    document: Mapped[Document] = relationship("Document", back_populates="index_record")

