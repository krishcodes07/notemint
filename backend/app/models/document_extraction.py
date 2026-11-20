"""Extraction and page models for Phase 6 PDF text processing."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document


class ExtractionStatus(str, enum.Enum):
    """Processing status for document extraction."""

    PENDING = "pending"
    EXTRACTING = "extracting"
    COMPLETED = "completed"
    FAILED = "failed"


_EXTRACTION_STATUS_IN_LIST = ", ".join(
    f"'{member.value}'" for member in ExtractionStatus
)


class DocumentExtraction(Base):
    """Metadata, status, and quality diagnostics for a document extraction."""

    __tablename__ = "document_extractions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Extraction record identifier",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
        comment="Associated document id",
    )
    doc_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="PDF metadata (title, author, subject, creation date, etc.)",
    )
    total_characters: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total characters extracted across all pages",
    )
    status: Mapped[ExtractionStatus] = mapped_column(
        Enum(
            ExtractionStatus,
            name="extraction_status",
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ExtractionStatus.PENDING,
        server_default=ExtractionStatus.PENDING.value,
        comment="Extraction status",
    )
    engine: Mapped[str] = mapped_column(
        String(length=64),
        nullable=False,
        default="pymupdf",
        comment="Extraction engine version/tag",
    )
    quality: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Quality analysis (is_scanned, empty_pages, low_text_pages, etc.)",
    )
    error_message: Mapped[str | None] = mapped_column(
        String(length=1024),
        nullable=True,
        comment="Safe sanitized error message if extraction failed",
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

    document: Mapped[Document] = relationship("Document", back_populates="extraction")

    def __repr__(self) -> str:
        return f"<DocumentExtraction id={self.id} doc={self.document_id} status={self.status}>"


class DocumentPage(Base):
    """Extracted text and metrics for a single page of a document."""

    __tablename__ = "document_pages"
    __table_args__ = (
        UniqueConstraint(
            "document_id",
            "page_number",
            name="uq_document_pages_document_id_page_number",
        ),
        Index(
            "ix_document_pages_document_id_page_number",
            "document_id",
            "page_number",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Page record identifier",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Associated document id",
    )
    page_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="1-based page number",
    )
    text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        comment="Extracted page text",
    )
    character_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Total characters on this page",
    )
    has_text: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Whether this page has meaningful text",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    document: Mapped[Document] = relationship("Document", back_populates="pages")

    def __repr__(self) -> str:
        return (
            f"<DocumentPage id={self.id} doc={self.document_id} "
            f"page={self.page_number} chars={self.character_count}>"
        )

