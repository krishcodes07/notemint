"""Document metadata model (foundation for Phase 5+ PDF uploads).

Rows describe files stored in Neon Object Storage; the bytes themselves
never live in PostgreSQL. No upload/processing routes exist yet.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    from app.models.document_chunk import DocumentChunk
    from app.models.document_extraction import DocumentExtraction, DocumentPage
    from app.models.document_index import DocumentIndex
    from app.models.study_generation_batch import StudyGenerationBatch
    from app.models.study_progress import (
        FlashcardProgress,
        QuestionBookmark,
        QuizAttempt,
        StudyActivity,
    )
    from app.models.study_resource import StudyResource
    from app.models.teacher_conversation import TeacherConversation
    from app.models.user import User


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
    extraction: Mapped[DocumentExtraction | None] = relationship(
        "DocumentExtraction",
        back_populates="document",
        uselist=False,
        cascade="all, delete-orphan",
    )
    pages: Mapped[list[DocumentPage]] = relationship(
        "DocumentPage",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentPage.page_number",
    )
    resources: Mapped[list[StudyResource]] = relationship(
        "StudyResource",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="StudyResource.created_at.desc()",
    )
    generation_batches: Mapped[list[StudyGenerationBatch]] = relationship(
        "StudyGenerationBatch",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="StudyGenerationBatch.created_at.desc()",
    )
    flashcard_progress: Mapped[list[FlashcardProgress]] = relationship(
        "FlashcardProgress",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    question_bookmarks: Mapped[list[QuestionBookmark]] = relationship(
        "QuestionBookmark",
        back_populates="document",
        cascade="all, delete-orphan",
    )
    quiz_attempts: Mapped[list[QuizAttempt]] = relationship(
        "QuizAttempt",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="QuizAttempt.completed_at.desc()",
    )
    activities: Mapped[list[StudyActivity]] = relationship(
        "StudyActivity",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="StudyActivity.created_at.desc()",
    )
    conversations: Mapped[list[TeacherConversation]] = relationship(
        "TeacherConversation",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="TeacherConversation.updated_at.desc()",
    )
    chunks: Mapped[list[DocumentChunk]] = relationship(
        "DocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )
    index_record: Mapped[DocumentIndex | None] = relationship(
        "DocumentIndex",
        back_populates="document",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def title(self) -> str | None:
        """AI-generated title for the study space, derived from synthesized materials."""
        try:
            res_list = self.resources
        except Exception:
            return None
        if not res_list:
            return None

        # 1. Notes title
        for r in res_list:
            if getattr(r, "is_active", False) and r.content:
                rt = getattr(r, "resource_type", None)
                rt_val = rt.value if hasattr(rt, "value") else str(rt)
                if rt_val == "notes":
                    t = r.content.get("title")
                    if t and str(t).strip() and str(t).strip().lower() != "smart study notes":
                        return str(t).strip()

        # 2. Summary title
        for r in res_list:
            if getattr(r, "is_active", False) and r.content:
                rt = getattr(r, "resource_type", None)
                rt_val = rt.value if hasattr(rt, "value") else str(rt)
                if rt_val == "summary":
                    t = r.content.get("title")
                    if t and str(t).strip() and str(t).strip().lower() != "chapter summary":
                        return str(t).strip()

        # 3. Any other non-generic resource title
        for r in res_list:
            if getattr(r, "is_active", False) and r.content and "title" in r.content:
                t = str(r.content["title"]).strip()
                if t and t.lower() not in (
                    "practice quiz",
                    "study flashcards",
                    "important questions & answers",
                ):
                    return t
        return None

    def __repr__(self) -> str:
        return f"<Document id={self.id} status={self.status}>"
