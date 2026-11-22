"""Study generation batch model for Phase 11 on-demand custom practice generation."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

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
    from app.models.study_resource import StudyResource


class BatchStatus(str, enum.Enum):
    """Processing and generation lifecycle status for an additional generation batch."""

    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class StudyGenerationBatch(Base):
    """Immutable batch record tracking on-demand additional AI study resource generation."""

    __tablename__ = "study_generation_batches"
    __table_args__ = (
        Index("ix_study_generation_batches_doc", "document_id"),
        Index(
            "ix_study_generation_batches_doc_type",
            "document_id",
            "resource_type",
        ),
        Index("ix_study_generation_batches_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the generation batch",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated document ID",
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey(
            "study_resources.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_study_generation_batches_resource_id",
        ),
        nullable=True,
        index=True,
        comment="Associated StudyResource created by this completed batch",
    )
    resource_type: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        comment="Type of study resource (questions, flashcards, quiz)",
    )
    difficulty: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="random",
        comment="Selected difficulty: easy, medium, hard, random",
    )
    requested_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
        comment="Number of items requested by student",
    )
    generated_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="Number of validated unique items successfully generated",
    )
    topic: Mapped[str | None] = mapped_column(
        String(length=256),
        nullable=True,
        comment="Optional focus topic for generation",
    )
    status: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default=BatchStatus.PENDING.value,
        server_default=BatchStatus.PENDING.value,
        comment="Batch lifecycle status: pending, generating, completed, failed",
    )
    model_name: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        comment="AI model used for generation",
    )
    prompt_version: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="v1",
        server_default="v1",
        comment="Prompt template version used",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Sanitized error description if batch failed",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when batch generation completed",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped[Document] = relationship(
        "Document",
        back_populates="generation_batches",
    )
    resource: Mapped[StudyResource | None] = relationship(
        "StudyResource",
        foreign_keys=[resource_id],
        back_populates="originating_batch",
    )
