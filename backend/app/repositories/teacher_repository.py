"""Data access repository for Phase 9 AI Teacher conversations and messages."""

from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.teacher_conversation import TeacherConversation
from app.models.teacher_message import TeacherMessage


class TeacherRepository:
    """Repository handling persistence and queries for teacher conversations and messages."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -----------------------------------------------------------------------
    # Conversation Methods
    # -----------------------------------------------------------------------

    def create_conversation(
        self,
        document_id: uuid.UUID,
        clerk_user_id: str,
        title: str = "New Conversation",
        teaching_mode: str = "explain",
        explanation_depth: str = "standard",
        preferred_language: str = "auto",
    ) -> TeacherConversation:
        """Create and persist a new teacher conversation."""
        conversation = TeacherConversation(
            document_id=document_id,
            clerk_user_id=clerk_user_id,
            title=title.strip() if title else "New Conversation",
            teaching_mode=teaching_mode,
            explanation_depth=explanation_depth,
            preferred_language=preferred_language,
        )
        self._session.add(conversation)
        self._session.flush()
        return conversation

    def get_conversation(
        self,
        conversation_id: uuid.UUID,
        clerk_user_id: str | None = None,
    ) -> TeacherConversation | None:
        """Fetch a conversation by ID, optionally scoped to owner."""
        query = select(TeacherConversation).where(TeacherConversation.id == conversation_id)
        if clerk_user_id is not None:
            query = query.where(TeacherConversation.clerk_user_id == clerk_user_id)
        return self._session.execute(query).scalar_one_or_none()

    def list_conversations(
        self,
        document_id: uuid.UUID,
        clerk_user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[TeacherConversation], int]:
        """Fetch paginated conversations for a document and user, ordered by latest update."""
        base_query = (
            select(TeacherConversation)
            .where(
                TeacherConversation.document_id == document_id,
                TeacherConversation.clerk_user_id == clerk_user_id,
            )
        )

        count_query = select(func.count()).select_from(base_query.subquery())
        total = self._session.execute(count_query).scalar_one()

        items_query = (
            base_query.order_by(TeacherConversation.updated_at.desc())
            .offset(offset)
            .limit(limit)
        )
        items = list(self._session.execute(items_query).scalars().all())
        return items, total

    def update_conversation(
        self,
        conversation: TeacherConversation,
        *,
        title: str | None = None,
        teaching_mode: str | None = None,
        explanation_depth: str | None = None,
        preferred_language: str | None = None,
    ) -> TeacherConversation:
        """Update metadata on an existing conversation."""
        if title is not None:
            conversation.title = title.strip()
        if teaching_mode is not None:
            conversation.teaching_mode = teaching_mode
        if explanation_depth is not None:
            conversation.explanation_depth = explanation_depth
        if preferred_language is not None:
            conversation.preferred_language = preferred_language

        self._session.flush()
        return conversation

    def delete_conversation(self, conversation: TeacherConversation) -> bool:
        """Delete conversation and its cascaded messages."""
        self._session.delete(conversation)
        self._session.flush()
        return True

    # -----------------------------------------------------------------------
    # Message Methods
    # -----------------------------------------------------------------------

    def create_message(
        self,
        conversation_id: uuid.UUID,
        role: str,
        content: str,
        *,
        source_pages: list[int] | None = None,
        model_name: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        status: str = "completed",
        error_message: str | None = None,
        client_message_id: str | None = None,
    ) -> TeacherMessage:
        """Create and persist a message within a conversation."""
        message = TeacherMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
            source_pages=source_pages,
            model_name=model_name,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            status=status,
            error_message=error_message,
            client_message_id=client_message_id,
        )
        self._session.add(message)
        self._session.flush()
        return message

    def get_message(self, message_id: uuid.UUID) -> TeacherMessage | None:
        """Fetch a message by ID."""
        return self._session.get(TeacherMessage, message_id)

    def get_message_by_client_id(
        self,
        conversation_id: uuid.UUID,
        client_message_id: str,
    ) -> TeacherMessage | None:
        """Fetch a message by client-supplied idempotency key."""
        query = select(TeacherMessage).where(
            TeacherMessage.conversation_id == conversation_id,
            TeacherMessage.client_message_id == client_message_id,
        )
        return self._session.execute(query).scalar_one_or_none()

    def get_recent_messages(
        self,
        conversation_id: uuid.UUID,
        limit: int = 20,
    ) -> list[TeacherMessage]:
        """Fetch the most recent N messages in chronological order."""
        subquery = (
            select(TeacherMessage)
            .where(TeacherMessage.conversation_id == conversation_id)
            .order_by(TeacherMessage.created_at.desc())
            .limit(limit)
            .subquery()
        )
        # Select from subquery and sort ascending
        query = select(TeacherMessage).from_statement(
            select(subquery).order_by(subquery.c.created_at.asc())
        )
        return list(self._session.execute(query).scalars().all())

    def list_messages(
        self,
        conversation_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> list[TeacherMessage]:
        """List messages in chronological order."""
        query = (
            select(TeacherMessage)
            .where(TeacherMessage.conversation_id == conversation_id)
            .order_by(TeacherMessage.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
        return list(self._session.execute(query).scalars().all())

    def count_messages(self, conversation_id: uuid.UUID) -> int:
        """Count total messages in a conversation."""
        query = select(func.count(TeacherMessage.id)).where(
            TeacherMessage.conversation_id == conversation_id
        )
        return self._session.execute(query).scalar_one()

    def update_message(
        self,
        message: TeacherMessage,
        *,
        content: str | None = None,
        source_pages: list[int] | None = None,
        model_name: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        status: str | None = None,
        error_message: str | None = None,
    ) -> TeacherMessage:
        """Update status, tokens, or content of a message."""
        if content is not None:
            message.content = content
        if source_pages is not None:
            message.source_pages = source_pages
        if model_name is not None:
            message.model_name = model_name
        if input_tokens is not None:
            message.input_tokens = input_tokens
        if output_tokens is not None:
            message.output_tokens = output_tokens
        if status is not None:
            message.status = status
        if error_message is not None:
            message.error_message = error_message

        self._session.flush()
        return message

    def delete_message(self, message: TeacherMessage) -> bool:
        """Delete a message."""
        self._session.delete(message)
        self._session.flush()
        return True

