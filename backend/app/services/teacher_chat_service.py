"""AI Teacher Chat service managing conversation sessions, memory, context, and responses."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncIterator, Iterator, Sequence

from sqlalchemy.orm import Session

from app.ai.base import (
    AICompletionResult,
    AIProviderError,
    BaseAIProvider,
)
from app.ai.prompts.teacher import (
    build_teacher_system_prompt,
    extract_cited_pages,
    format_context_for_prompt,
    sanitize_and_verify_citations,
)
from app.ai.provider_factory import get_ai_provider
from app.core.config import settings
from app.models.document import Document
from app.models.document_extraction import ExtractionStatus
from app.models.teacher_conversation import TeacherConversation
from app.models.teacher_message import TeacherMessage
from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.repositories.teacher_repository import TeacherRepository
from app.services.document_context_service import (
    EmptyDocumentContextError,
    ExtractionNotCompletedError,
    estimate_tokens,
)
from app.services.hybrid_retrieval_service import HybridRetrievalService
from app.services.teacher_context_service import (
    TeacherContextResult,
    TeacherContextRetriever,
    TeacherContextService,
)

logger = logging.getLogger(__name__)


class TeacherChatError(Exception):
    """Base exception for AI Teacher chat operations."""


class DocumentNotAccessibleError(TeacherChatError):
    """Document is missing or not owned by the requesting user."""


class ConversationNotFoundError(TeacherChatError):
    """Conversation does not exist or does not belong to the user/document."""


class MessageNotFoundError(TeacherChatError):
    """Message does not exist or does not belong to the conversation."""


class TeacherChatService:
    """Service orchestrating AI Teacher conversations, context retrieval, and generation."""

    def __init__(
        self,
        session: Session,
        ai_provider: BaseAIProvider | None = None,
        context_service: TeacherContextRetriever | None = None,
    ) -> None:
        self._session = session
        self._doc_repo = DocumentRepository(session)
        self._extraction_repo = ExtractionRepository(session)
        self._teacher_repo = TeacherRepository(session)
        self._context_service = context_service or HybridRetrievalService(session)
        self._ai_provider = ai_provider or get_ai_provider()

    # -----------------------------------------------------------------------
    # Document & Conversation Verification
    # -----------------------------------------------------------------------

    def verify_document_access(self, document_id: uuid.UUID, clerk_user_id: str) -> Document:
        """Verify that the document exists and is owned by the user."""
        doc = self._doc_repo.get_by_id(document_id=document_id, clerk_user_id=clerk_user_id)
        if doc is None:
            raise DocumentNotAccessibleError(
                f"Document {document_id} was not found or access is unauthorized."
            )
        return doc

    def verify_extraction_completed(self, document_id: uuid.UUID) -> None:
        """Verify that the document text extraction has completed successfully."""
        extraction = self._extraction_repo.get_by_document_id(document_id)
        if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
            status_str = extraction.status.value if extraction else "missing"
            raise ExtractionNotCompletedError(
                f"Document text extraction is not complete (status: {status_str}). "
                "AI Teacher requires completed text extraction."
            )

    def get_conversation_or_raise(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
    ) -> TeacherConversation:
        """Fetch a conversation and verify its document and owner scope."""
        conv = self._teacher_repo.get_conversation(
            conversation_id=conversation_id,
            clerk_user_id=clerk_user_id,
        )
        if conv is None or conv.document_id != document_id:
            raise ConversationNotFoundError(
                f"Conversation {conversation_id} was not found for this document."
            )
        return conv

    def get_message_or_raise(
        self,
        conversation_id: uuid.UUID,
        message_id: uuid.UUID,
    ) -> TeacherMessage:
        """Fetch a message and verify it belongs to the given conversation."""
        message = self._teacher_repo.get_message(message_id)
        if message is None or message.conversation_id != conversation_id:
            raise MessageNotFoundError(
                f"Message {message_id} was not found in conversation {conversation_id}."
            )
        return message

    # -----------------------------------------------------------------------
    # Conversation Management
    # -----------------------------------------------------------------------

    def create_conversation(
        self,
        document_id: uuid.UUID,
        clerk_user_id: str,
        title: str | None = None,
        teaching_mode: str = "explain",
        explanation_depth: str = "standard",
        preferred_language: str = "auto",
    ) -> TeacherConversation:
        """Create a new AI Teacher conversation session."""
        self.verify_document_access(document_id, clerk_user_id)
        self.verify_extraction_completed(document_id)

        conv = self._teacher_repo.create_conversation(
            document_id=document_id,
            clerk_user_id=clerk_user_id,
            title=title or "New Conversation",
            teaching_mode=teaching_mode,
            explanation_depth=explanation_depth,
            preferred_language=preferred_language,
        )
        self._session.commit()
        return conv

    def list_conversations(
        self,
        document_id: uuid.UUID,
        clerk_user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[TeacherConversation], int]:
        """List all conversations for a document."""
        self.verify_document_access(document_id, clerk_user_id)
        return self._teacher_repo.list_conversations(
            document_id=document_id,
            clerk_user_id=clerk_user_id,
            limit=limit,
            offset=offset,
        )

    def get_conversation_detail(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
    ) -> tuple[TeacherConversation, list[TeacherMessage]]:
        """Get full conversation detail and chronological messages."""
        self.verify_document_access(document_id, clerk_user_id)
        conv = self.get_conversation_or_raise(document_id, conversation_id, clerk_user_id)
        messages = self._teacher_repo.list_messages(conversation_id, limit=200, offset=0)
        return conv, messages

    def update_conversation(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
        *,
        title: str | None = None,
        teaching_mode: str | None = None,
        explanation_depth: str | None = None,
        preferred_language: str | None = None,
    ) -> TeacherConversation:
        """Update conversation title or settings."""
        self.verify_document_access(document_id, clerk_user_id)
        conv = self.get_conversation_or_raise(document_id, conversation_id, clerk_user_id)
        updated = self._teacher_repo.update_conversation(
            conv,
            title=title,
            teaching_mode=teaching_mode,
            explanation_depth=explanation_depth,
            preferred_language=preferred_language,
        )
        self._session.commit()
        return updated

    def delete_conversation(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
    ) -> bool:
        """Delete a conversation and all its messages."""
        self.verify_document_access(document_id, clerk_user_id)
        conv = self.get_conversation_or_raise(document_id, conversation_id, clerk_user_id)
        self._teacher_repo.delete_conversation(conv)
        self._session.commit()
        return True

    # -----------------------------------------------------------------------
    # Message Dispatch & Memory
    # -----------------------------------------------------------------------

    def _build_bounded_conversation_messages(
        self,
        conversation_id: uuid.UUID,
        max_history_tokens: int | None = None,
    ) -> tuple[list[dict[str, str]], Sequence[dict[str, str]]]:
        """Fetch and assemble recent message history within token constraints."""
        budget = max_history_tokens or settings.ai_teacher_max_history_tokens
        # Retrieve recent 20 messages
        recent_msgs = self._teacher_repo.get_recent_messages(conversation_id, limit=20)

        # Filter only completed messages for LLM context
        completed = [m for m in recent_msgs if m.status == "completed" and m.content.strip()]

        assembled: list[dict[str, str]] = []
        token_count = 0

        # Assemble backwards to preserve most recent context
        for msg in reversed(completed):
            msg_tokens = estimate_tokens(msg.content)
            if token_count + msg_tokens > budget and assembled:
                break
            assembled.insert(0, {"role": msg.role, "content": msg.content})
            token_count += msg_tokens

        return assembled, assembled

    def send_message(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
        content: str,
        client_message_id: str | None = None,
        is_voice_mode: bool = False,
    ) -> tuple[TeacherMessage, TeacherMessage]:
        """Send a student message, retrieve bounded context, and generate an AI response."""
        self.verify_document_access(document_id, clerk_user_id)
        self.verify_extraction_completed(document_id)
        conv = self.get_conversation_or_raise(document_id, conversation_id, clerk_user_id)

        clean_content = content.strip()
        if not clean_content:
            raise ValueError("Message content cannot be empty.")
        if len(clean_content) > settings.ai_teacher_max_message_chars:
            clean_content = clean_content[: settings.ai_teacher_max_message_chars]

        # 1. Idempotency Check
        if client_message_id:
            existing_user_msg = self._teacher_repo.get_message_by_client_id(
                conversation_id, client_message_id
            )
            if existing_user_msg is not None:
                # Find subsequent assistant message
                recent = self._teacher_repo.list_messages(conversation_id, limit=10)
                user_idx = next(
                    (i for i, m in enumerate(recent) if m.id == existing_user_msg.id),
                    None,
                )
                if user_idx is not None and user_idx + 1 < len(recent):
                    subsequent_assistant = recent[user_idx + 1]
                    if subsequent_assistant.status == "completed":
                        return existing_user_msg, subsequent_assistant

        # 2. Persist user message
        user_msg = self._teacher_repo.create_message(
            conversation_id=conversation_id,
            role="user",
            content=clean_content,
            status="completed",
            client_message_id=client_message_id,
        )
        self._session.commit()

        # 3. Create assistant message placeholder in 'processing' status
        assistant_msg = self._teacher_repo.create_message(
            conversation_id=conversation_id,
            role="assistant",
            content="",
            status="processing",
        )
        self._session.commit()

        # 4. Assemble context & prompt
        try:
            history_messages, raw_history = self._build_bounded_conversation_messages(
                conversation_id=conversation_id,
            )

            # Retrieve grounded context
            context_result = self._context_service.retrieve(
                document_id=document_id,
                query=clean_content,
                conversation_history=raw_history,
            )

            # Build system prompt
            system_prompt = build_teacher_system_prompt(
                teaching_mode=conv.teaching_mode,
                explanation_depth=conv.explanation_depth,
                preferred_language=conv.preferred_language,
                is_voice_mode=is_voice_mode,
            )
            grounded_system_prompt = (
                f"{system_prompt}\n\n"
                f"{format_context_for_prompt(context_result.formatted_context)}"
            )

            llm_messages: list[dict[str, str]] = [
                {"role": "system", "content": grounded_system_prompt},
            ]
            # Add conversation history (excluding the current user message to avoid duplication)
            for h in history_messages[:-1] if history_messages and history_messages[-1]["content"] == clean_content else history_messages:
                llm_messages.append(h)
            # Add current user message
            llm_messages.append({"role": "user", "content": clean_content})

            # 5. Call AI Provider
            completion: AICompletionResult = self._ai_provider.generate(
                messages=llm_messages,
                max_tokens=settings.ai_teacher_max_output_tokens,
                temperature=settings.ai_temperature,
            )

            # 6. Extract and verify citations against retrieved pages
            cited_pages = extract_cited_pages(completion.content)
            verified_pages = sanitize_and_verify_citations(
                cited_pages=cited_pages,
                allowed_pages=context_result.page_numbers,
            )

            # 7. Update assistant message to completed
            self._teacher_repo.update_message(
                assistant_msg,
                content=completion.content,
                source_pages=verified_pages,
                model_name=completion.model,
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
                status="completed",
                error_message=None,
            )
            # Touch conversation updated_at
            self._teacher_repo.update_conversation(conv)
            self._session.commit()

            return user_msg, assistant_msg

        except Exception as exc:
            logger.error("AI Teacher generation failed for message %s: %s", assistant_msg.id, exc)
            self._session.rollback()
            # Mark assistant message as failed
            self._teacher_repo.update_message(
                assistant_msg,
                status="failed",
                error_message=str(exc),
            )
            self._session.commit()
            raise

    def stream_message(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
        content: str,
        client_message_id: str | None = None,
        is_voice_mode: bool = False,
    ) -> Iterator[str]:
        """Stream an AI Teacher response using Server-Sent Events format."""
        self.verify_document_access(document_id, clerk_user_id)
        self.verify_extraction_completed(document_id)
        conv = self.get_conversation_or_raise(document_id, conversation_id, clerk_user_id)

        clean_content = content.strip()
        if not clean_content:
            raise ValueError("Message content cannot be empty.")
        if len(clean_content) > settings.ai_teacher_max_message_chars:
            clean_content = clean_content[: settings.ai_teacher_max_message_chars]

        # 1. Persist user message
        user_msg = self._teacher_repo.create_message(
            conversation_id=conversation_id,
            role="user",
            content=clean_content,
            status="completed",
            client_message_id=client_message_id,
        )
        self._session.commit()

        # 2. Persist assistant message in processing state
        assistant_msg = self._teacher_repo.create_message(
            conversation_id=conversation_id,
            role="assistant",
            content="",
            status="processing",
        )
        self._session.commit()

        # 3. Yield message_started event
        started_event = {
            "event": "message_started",
            "data": {
                "user_message_id": str(user_msg.id),
                "assistant_message_id": str(assistant_msg.id),
                "conversation_id": str(conversation_id),
                "teaching_mode": conv.teaching_mode,
                "created_at": user_msg.created_at.isoformat(),
            },
        }
        yield f"event: {started_event['event']}\ndata: {json.dumps(started_event['data'])}\n\n"

        accumulated_chunks: list[str] = []
        try:
            history_messages, raw_history = self._build_bounded_conversation_messages(
                conversation_id=conversation_id,
            )

            context_result = self._context_service.retrieve(
                document_id=document_id,
                query=clean_content,
                conversation_history=raw_history,
            )

            system_prompt = build_teacher_system_prompt(
                teaching_mode=conv.teaching_mode,
                explanation_depth=conv.explanation_depth,
                preferred_language=conv.preferred_language,
                is_voice_mode=is_voice_mode,
            )
            grounded_system_prompt = (
                f"{system_prompt}\n\n"
                f"{format_context_for_prompt(context_result.formatted_context)}"
            )

            llm_messages: list[dict[str, str]] = [
                {"role": "system", "content": grounded_system_prompt},
            ]
            for h in history_messages[:-1] if history_messages and history_messages[-1]["content"] == clean_content else history_messages:
                llm_messages.append(h)
            llm_messages.append({"role": "user", "content": clean_content})

            # Stream deltas from provider
            stream_gen = self._ai_provider.generate_stream(
                messages=llm_messages,
                max_tokens=settings.ai_teacher_max_output_tokens,
                temperature=settings.ai_temperature,
            )

            for chunk in stream_gen:
                if chunk:
                    accumulated_chunks.append(chunk)
                    delta_payload = {
                        "event": "text_delta",
                        "data": {"delta": chunk},
                    }
                    yield f"event: {delta_payload['event']}\ndata: {json.dumps(delta_payload['data'])}\n\n"

            full_text = "".join(accumulated_chunks)

            # Citation extraction & validation
            cited_pages = extract_cited_pages(full_text)
            verified_pages = sanitize_and_verify_citations(
                cited_pages=cited_pages,
                allowed_pages=context_result.page_numbers,
            )

            output_tokens = estimate_tokens(full_text)
            input_tokens = estimate_tokens(grounded_system_prompt) + estimate_tokens(clean_content)

            self._teacher_repo.update_message(
                assistant_msg,
                content=full_text,
                source_pages=verified_pages,
                model_name=settings.kilo_model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                status="completed",
                error_message=None,
            )
            self._teacher_repo.update_conversation(conv)
            self._session.commit()

            completed_payload = {
                "event": "message_completed",
                "data": {
                    "assistant_message_id": str(assistant_msg.id),
                    "conversation_id": str(conversation_id),
                    "role": "assistant",
                    "content": full_text,
                    "source_pages": verified_pages,
                    "model_name": settings.kilo_model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "status": "completed",
                    "created_at": assistant_msg.created_at.isoformat(),
                },
            }
            yield f"event: {completed_payload['event']}\ndata: {json.dumps(completed_payload['data'])}\n\n"

        except Exception as exc:
            logger.error("Streaming failed for message %s: %s", assistant_msg.id, exc)
            self._session.rollback()
            self._teacher_repo.update_message(
                assistant_msg,
                status="failed",
                error_message=str(exc),
            )
            self._session.commit()

            failed_payload = {
                "event": "message_failed",
                "data": {
                    "assistant_message_id": str(assistant_msg.id),
                    "error": str(exc),
                },
            }
            yield f"event: {failed_payload['event']}\ndata: {json.dumps(failed_payload['data'])}\n\n"

    def retry_message(
        self,
        document_id: uuid.UUID,
        conversation_id: uuid.UUID,
        clerk_user_id: str,
        message_id: uuid.UUID,
    ) -> tuple[TeacherMessage, TeacherMessage]:
        """Retry generating a response for a failed assistant message without duplicating the user message."""
        self.verify_document_access(document_id, clerk_user_id)
        conv = self.get_conversation_or_raise(document_id, conversation_id, clerk_user_id)

        assistant_msg = self._teacher_repo.get_message(message_id)
        if assistant_msg is None or assistant_msg.conversation_id != conversation_id:
            raise ValueError(f"Message {message_id} not found in this conversation.")

        if assistant_msg.role != "assistant":
            raise ValueError("Only assistant messages can be retried.")

        # Find preceding user message
        messages = self._teacher_repo.list_messages(conversation_id, limit=100)
        assistant_idx = next((i for i, m in enumerate(messages) if m.id == assistant_msg.id), None)
        if assistant_idx is None or assistant_idx == 0:
            raise ValueError("Preceding user message not found.")

        user_msg = messages[assistant_idx - 1]
        if user_msg.role != "user":
            raise ValueError("Preceding message is not a user message.")

        # Mark assistant message as processing
        self._teacher_repo.update_message(
            assistant_msg,
            status="processing",
            error_message=None,
        )
        self._session.commit()

        try:
            history_messages, raw_history = self._build_bounded_conversation_messages(
                conversation_id=conversation_id,
            )

            context_result = self._context_service.retrieve(
                document_id=document_id,
                query=user_msg.content,
                conversation_history=raw_history,
            )

            system_prompt = build_teacher_system_prompt(
                teaching_mode=conv.teaching_mode,
                explanation_depth=conv.explanation_depth,
                preferred_language=conv.preferred_language,
            )
            grounded_system_prompt = (
                f"{system_prompt}\n\n"
                f"{format_context_for_prompt(context_result.formatted_context)}"
            )

            llm_messages: list[dict[str, str]] = [
                {"role": "system", "content": grounded_system_prompt},
            ]
            # Exclude this turn
            for h in history_messages:
                if h["content"] != user_msg.content and h["content"] != assistant_msg.content:
                    llm_messages.append(h)
            llm_messages.append({"role": "user", "content": user_msg.content})

            completion = self._ai_provider.generate(
                messages=llm_messages,
                max_tokens=settings.ai_teacher_max_output_tokens,
                temperature=settings.ai_temperature,
            )

            cited_pages = extract_cited_pages(completion.content)
            verified_pages = sanitize_and_verify_citations(
                cited_pages=cited_pages,
                allowed_pages=context_result.page_numbers,
            )

            self._teacher_repo.update_message(
                assistant_msg,
                content=completion.content,
                source_pages=verified_pages,
                model_name=completion.model,
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
                status="completed",
                error_message=None,
            )
            self._teacher_repo.update_conversation(conv)
            self._session.commit()

            return user_msg, assistant_msg

        except Exception as exc:
            logger.error("Retry failed for assistant message %s: %s", assistant_msg.id, exc)
            self._session.rollback()
            self._teacher_repo.update_message(
                assistant_msg,
                status="failed",
                error_message=str(exc),
            )
            self._session.commit()
            raise
