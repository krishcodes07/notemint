"""TeacherMessage model for Phase 9 AI Teacher chat tutor messages."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

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

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.teacher_conversation import TeacherConversation


class TeacherMessage(Base):
    """An individual user or assistant message within an AI Teacher conversation."""

    __tablename__ = "teacher_messages"
    __table_args__ = (
        Index("ix_teacher_messages_conv_created", "conversation_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique identifier for the message",
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("teacher_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Parent conversation ID",
    )
    role: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        comment="Message role: user or assistant",
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Full message text",
    )
    source_pages: Mapped[list[int] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Verified original PDF page numbers cited in assistant explanation",
    )
    model_name: Mapped[str | None] = mapped_column(
        String(length=128),
        nullable=True,
        comment="Model identifier used for assistant completion",
    )
    input_tokens: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Input prompt tokens consumed",
    )
    output_tokens: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Output completion tokens generated",
    )
    status: Mapped[str] = mapped_column(
        String(length=32),
        nullable=False,
        default="completed",
        server_default="completed",
        comment="Message status: completed, processing, failed",
    )
    error_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Error message if generation failed",
    )
    client_message_id: Mapped[str | None] = mapped_column(
        String(length=128),
        nullable=True,
        index=True,
        comment="Client-supplied idempotency key for deduplication",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Message timestamp",
    )

    conversation: Mapped[TeacherConversation] = relationship(
        "TeacherConversation",
        back_populates="messages",
    )

    def __repr__(self) -> str:
        return f"<TeacherMessage id={self.id} role={self.role} status={self.status}>"

