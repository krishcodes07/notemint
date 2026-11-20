"""Study resource model for Phase 7 AI-generated learning materials."""

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
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document


class ResourceType(str, enum.Enum):
    """Supported AI study resource types."""

    NOTES = "notes"
    QUESTIONS = "questions"
    FLASHCARDS = "flashcards"
    QUIZ = "quiz"
    SUMMARY = "summary"


class ResourceStatus(str, enum.Enum):
    """Processing and generation status for a study resource."""

    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class StudyResource(Base):
    """AI-generated study material associated with an extracted document."""

    __tablename__ = "study_resources"
    __table_args__ = (
        Index(
            "ix_study_resources_doc_type_active",
            "document_id",
            "resource_type",
            "is_active",
        ),
        Index("ix_study_resources_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the generated resource",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Associated document ID",
    )
    resource_type: Mapped[ResourceType] = mapped_column(
        Enum(
            ResourceType,
            name="study_resource_type",
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        comment="Type of learning resource (notes, questions, flashcards, quiz, summary)",
    )
    status: Mapped[ResourceStatus] = mapped_column(
        Enum(
            ResourceStatus,
            name="study_resource_status",
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ResourceStatus.PENDING,
        server_default=ResourceStatus.PENDING.value,
        comment="Generation status (pending, generating, completed, failed)",
    )
    content: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Validated structured JSON content of the generated resource",
    )
    model_name: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        comment="AI model identifier used for generation",
    )
    prompt_version: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="v1",
        server_default="v1",
        comment="Version of the prompt template used",
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
        comment="Generation version number (increments on regenerate)",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
        comment="Whether this version is currently the active viewable resource",
    )
    input_tokens: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Reported or estimated input token count",
    )
    output_tokens: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Reported or estimated output token count",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Sanitized error description if generation failed",
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

    # Relationships
    document: Mapped[Document] = relationship("Document", back_populates="resources")

