"""Models for Phase 8 student learning interactions, progress tracking, bookmarks, and quiz attempts."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.study_resource import StudyResource


class ActivityType(str, enum.Enum):
    """Types of tracked study activities."""

    FLASHCARD_REVIEWED = "flashcard_reviewed"
    QUESTION_BOOKMARKED = "question_bookmarked"
    QUIZ_COMPLETED = "quiz_completed"
    STUDY_SESSION = "study_session"


class FlashcardProgress(Base):
    """Tracks a student's review count and mastery level on a specific flashcard."""

    __tablename__ = "flashcard_progress"
    __table_args__ = (
        UniqueConstraint(
            "clerk_user_id",
            "resource_id",
            "card_id",
            name="uq_flashcard_progress_user_resource_card",
        ),
        Index("ix_flashcard_progress_user_doc", "clerk_user_id", "document_id"),
        Index("ix_flashcard_progress_resource", "resource_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the flashcard progress entry",
    )
    clerk_user_id: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        index=True,
        comment="Owner user ID",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated document ID",
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("study_resources.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated flashcards StudyResource ID",
    )
    card_id: Mapped[str] = mapped_column(
        String(length=64),
        nullable=False,
        comment="Stable flashcard identifier from generated content",
    )
    mastery_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="Mastery level: 0=Not studied, 1=Learning, 2=Familiar, 3=Mastered",
    )
    review_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="Total times card has been reviewed",
    )
    correct_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="Number of times answered as known",
    )
    incorrect_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="Number of times answered as again",
    )
    last_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp of most recent review",
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
    document: Mapped[Document] = relationship("Document", back_populates="flashcard_progress")
    resource: Mapped[StudyResource] = relationship("StudyResource", back_populates="flashcard_progress")


class QuestionBookmark(Base):
    """Bookmarks for important questions saved by students for later revision."""

    __tablename__ = "question_bookmarks"
    __table_args__ = (
        UniqueConstraint(
            "clerk_user_id",
            "resource_id",
            "question_id",
            name="uq_question_bookmarks_user_resource_question",
        ),
        Index("ix_question_bookmarks_user_doc", "clerk_user_id", "document_id"),
        Index("ix_question_bookmarks_resource", "resource_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the bookmark",
    )
    clerk_user_id: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        index=True,
        comment="Owner user ID",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated document ID",
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("study_resources.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated questions StudyResource ID",
    )
    question_id: Mapped[str] = mapped_column(
        String(length=64),
        nullable=False,
        comment="Stable question identifier from generated content",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped[Document] = relationship("Document", back_populates="question_bookmarks")
    resource: Mapped[StudyResource] = relationship("StudyResource", back_populates="question_bookmarks")


class QuizAttempt(Base):
    """Persisted record of a student's completed quiz attempt."""

    __tablename__ = "quiz_attempts"
    __table_args__ = (
        Index("ix_quiz_attempts_user_doc", "clerk_user_id", "document_id"),
        Index("ix_quiz_attempts_resource", "resource_id"),
        Index("ix_quiz_attempts_completed_at", "completed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the quiz attempt",
    )
    clerk_user_id: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        index=True,
        comment="Owner user ID",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated document ID",
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("study_resources.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated quiz StudyResource ID",
    )
    total_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Total questions in this quiz attempt",
    )
    correct_answers: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Number of correct answers",
    )
    score_percentage: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        comment="Score percentage (0.0 to 100.0)",
    )
    submitted_answers: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        comment="User's submitted answers {question_id: option_index}",
    )
    graded_result: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        comment="Complete graded evaluation with explanations",
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped[Document] = relationship("Document", back_populates="quiz_attempts")
    resource: Mapped[StudyResource] = relationship("StudyResource", back_populates="quiz_attempts")


class StudyActivity(Base):
    """Lightweight event log of student study actions for activity tracking."""

    __tablename__ = "study_activities"
    __table_args__ = (
        Index("ix_study_activities_user_doc", "clerk_user_id", "document_id"),
        Index("ix_study_activities_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    clerk_user_id: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        index=True,
        comment="Owner user ID",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated document ID",
    )
    activity_type: Mapped[str] = mapped_column(
        String(length=64),
        nullable=False,
        comment="Activity type (e.g. flashcard_reviewed, question_bookmarked, quiz_completed)",
    )
    resource_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("study_resources.id", ondelete="CASCADE"),
        nullable=True,
        comment="Optional associated study resource ID",
    )
    activity_metadata: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Optional activity metadata",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    document: Mapped[Document] = relationship("Document", back_populates="activities")
    resource: Mapped[StudyResource | None] = relationship("StudyResource", back_populates="activities")
