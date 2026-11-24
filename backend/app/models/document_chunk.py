"""SQLAlchemy model for document chunks and dense vector embeddings (Phase 10)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document

EMBEDDING_DIM = getattr(settings, "embedding_dimensions", 1024)


class DocumentChunk(Base):
    """Searchable passage chunk with pgvector embedding."""

    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("ix_document_chunks_doc_chunk", "document_id", "chunk_index"),
        Index("ix_document_chunks_doc_page", "document_id", "page_start", "page_end"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the chunk",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Foreign key to documents table",
    )
    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Zero-based sequence index within the document",
    )
    text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Cleaned passage text content",
    )
    page_start: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Starting 1-based original PDF page number",
    )
    page_end: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Ending 1-based original PDF page number",
    )
    page_numbers: Mapped[list[int]] = mapped_column(
        JSON,
        nullable=False,
        comment="All original PDF page numbers covered by this chunk",
    )
    token_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Estimated or exact token count",
    )
    content_hash: Mapped[str] = mapped_column(
        String(length=64),
        nullable=False,
        comment="SHA-256 hash of the chunk text",
    )
    embedding: Mapped[Any] = mapped_column(
        Vector(EMBEDDING_DIM),
        nullable=True,
        comment="pgvector dense embedding vector",
    )
    embedding_model: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        comment="Model identifier used to produce the embedding",
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

    document: Mapped[Document] = relationship("Document", back_populates="chunks")

