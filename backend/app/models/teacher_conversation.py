"""TeacherConversation model for Phase 9 AI Teacher chat tutor."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.teacher_message import TeacherMessage


class TeacherConversation(Base):
    """A persistent conversation between a student and the AI Teacher for a document."""

    __tablename__ = "teacher_conversations"
    __table_args__ = (
        Index("ix_teacher_conversations_user_doc", "clerk_user_id", "document_id"),
        Index("ix_teacher_conversations_updated_at", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the teacher conversation",
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Associated document ID",
    )
    clerk_user_id: Mapped[str] = mapped_column(
        String(length=128),
        nullable=False,
        index=True,
        comment="Owner Clerk user ID",
    )
    title: Mapped[str] = mapped_column(
        String(length=256),
        nullable=False,
        default="New Conversation",
        comment="Human-readable conversation title",
    )
    teaching_mode: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="explain",
        comment="Pedagogical mode: explain, simplify, socratic",
    )
    explanation_depth: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="standard",
        comment="Explanation depth: quick, standard, detailed",
    )
    preferred_language: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="auto",
        comment="Preferred language: auto, en, hi, hinglish",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Conversation creation timestamp",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="Conversation last updated timestamp",
    )

    document: Mapped[Document] = relationship(
        "Document",
        back_populates="conversations",
    )
    messages: Mapped[list[TeacherMessage]] = relationship(
        "TeacherMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="TeacherMessage.created_at.asc()",
    )

    def __repr__(self) -> str:
        return f"<TeacherConversation id={self.id} title={self.title!r} mode={self.teaching_mode}>"

