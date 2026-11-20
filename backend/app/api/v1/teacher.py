"""API endpoints for Phase 9 AI Teacher & Interactive Chat Tutor."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.ai.base import (
    AIAuthenticationError,
    AIModelNotFoundError,
    AIProviderError,
    AIQuotaExceededError,
    AIRateLimitError,
    AITimeoutError,
    BaseAIProvider,
)
from app.ai.provider_factory import get_ai_provider
from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.teacher import (
    TeacherConversationCreate,
    TeacherConversationDetailResponse,
    TeacherConversationListResponse,
    TeacherConversationResponse,
    TeacherConversationUpdate,
    TeacherMessageResponse,
    TeacherMessageSend,
    TeacherSpeechRequest,
)
from app.services.document_context_service import (
    EmptyDocumentContextError,
    ExtractionNotCompletedError,
)
from app.services.edge_tts_service import (
    EdgeTTSService,
    TTSError,
    TTSServiceError,
    TTSValidationError,
)
from app.services.teacher_chat_service import (
    ConversationNotFoundError,
    DocumentNotAccessibleError,
    MessageNotFoundError,
    TeacherChatError,
    TeacherChatService,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["teacher"])


def get_teacher_service(
    session: Session = Depends(get_db),
    ai_provider: BaseAIProvider = Depends(get_ai_provider),
) -> TeacherChatService:
    """Dependency injection provider for TeacherChatService."""
    return TeacherChatService(session=session, ai_provider=ai_provider)


# ---------------------------------------------------------------------------
# 1. Create Conversation
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/conversations",
    response_model=TeacherConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new AI Teacher conversation session",
)
def create_conversation(
    document_id: uuid.UUID,
    payload: TeacherConversationCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Any:
    try:
        conv = service.create_conversation(
            document_id=document_id,
            clerk_user_id=current_user.user_id,
            title=payload.title,
            teaching_mode=payload.teaching_mode,
            explanation_depth=payload.explanation_depth,
            preferred_language=payload.preferred_language,
        )
        return conv
    except DocumentNotAccessibleError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ExtractionNotCompletedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# 2. List Conversations
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}/conversations",
    response_model=TeacherConversationListResponse,
    summary="List teacher conversations for a document",
)
def list_conversations(
    document_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Any:
    try:
        items, total = service.list_conversations(
            document_id=document_id,
            clerk_user_id=current_user.user_id,
            limit=limit,
            offset=offset,
        )
        # Populate message counts
        response_items: list[TeacherConversationResponse] = []
        for c in items:
            resp_item = TeacherConversationResponse(
                id=c.id,
                document_id=c.document_id,
                clerk_user_id=c.clerk_user_id,
                title=c.title,
                teaching_mode=c.teaching_mode,
                explanation_depth=c.explanation_depth,
                preferred_language=c.preferred_language,
                message_count=len(c.messages),
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            response_items.append(resp_item)

        return TeacherConversationListResponse(
            items=response_items,
            total=total,
            limit=limit,
            offset=offset,
        )
    except DocumentNotAccessibleError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ---------------------------------------------------------------------------
# 3. List Supported Edge TTS Voices (Phase 9.1)
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}/conversations/voices",
    summary="List supported Edge TTS voices and default settings for AI Teacher",
)
def list_supported_voices(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> dict[str, Any]:
    try:
        service.verify_document_access(document_id, current_user.user_id)
        tts = EdgeTTSService()
        return {
            "default_voice": tts.default_voice,
            "voices": tts.get_supported_voices(),
        }
    except DocumentNotAccessibleError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ---------------------------------------------------------------------------
# 4. Get Conversation Detail
# ---------------------------------------------------------------------------


@router.get(
    "/{document_id}/conversations/{conversation_id}",
    response_model=TeacherConversationDetailResponse,
    summary="Get conversation metadata and chronological message history",
)
def get_conversation_detail(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Any:
    try:
        conv, messages = service.get_conversation_detail(
            document_id=document_id,
            conversation_id=conversation_id,
            clerk_user_id=current_user.user_id,
        )
        msg_responses = [TeacherMessageResponse.model_validate(m) for m in messages]
        return TeacherConversationDetailResponse(
            id=conv.id,
            document_id=conv.document_id,
            clerk_user_id=conv.clerk_user_id,
            title=conv.title,
            teaching_mode=conv.teaching_mode,
            explanation_depth=conv.explanation_depth,
            preferred_language=conv.preferred_language,
            message_count=len(messages),
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            messages=msg_responses,
        )
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ---------------------------------------------------------------------------
# 4. Update Conversation
# ---------------------------------------------------------------------------


@router.patch(
    "/{document_id}/conversations/{conversation_id}",
    response_model=TeacherConversationResponse,
    summary="Update conversation title or pedagogical settings",
)
def update_conversation(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: TeacherConversationUpdate,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Any:
    try:
        updated = service.update_conversation(
            document_id=document_id,
            conversation_id=conversation_id,
            clerk_user_id=current_user.user_id,
            title=payload.title,
            teaching_mode=payload.teaching_mode,
            explanation_depth=payload.explanation_depth,
            preferred_language=payload.preferred_language,
        )
        return TeacherConversationResponse(
            id=updated.id,
            document_id=updated.document_id,
            clerk_user_id=updated.clerk_user_id,
            title=updated.title,
            teaching_mode=updated.teaching_mode,
            explanation_depth=updated.explanation_depth,
            preferred_language=updated.preferred_language,
            message_count=len(updated.messages),
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ---------------------------------------------------------------------------
# 5. Delete Conversation
# ---------------------------------------------------------------------------


@router.delete(
    "/{document_id}/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete conversation and associated messages",
)
def delete_conversation(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> None:
    try:
        service.delete_conversation(
            document_id=document_id,
            conversation_id=conversation_id,
            clerk_user_id=current_user.user_id,
        )
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ---------------------------------------------------------------------------
# 6. Send Message (Non-Streaming)
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/conversations/{conversation_id}/messages",
    response_model=TeacherMessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Send a message to the AI Teacher and receive a grounded explanation",
)
def send_message(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: TeacherMessageSend,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Any:
    try:
        _user_msg, assistant_msg = service.send_message(
            document_id=document_id,
            conversation_id=conversation_id,
            clerk_user_id=current_user.user_id,
            content=payload.content,
            client_message_id=payload.client_message_id,
            is_voice_mode=payload.is_voice_mode,
        )
        return assistant_msg
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (ExtractionNotCompletedError, EmptyDocumentContextError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except (AIRateLimitError, AITimeoutError) as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))
    except AIQuotaExceededError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc))
    except AIAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        logger.error("Unexpected error in teacher send_message: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate AI response.")


# ---------------------------------------------------------------------------
# 7. Send Message (Server-Sent Events Streaming)
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/conversations/{conversation_id}/messages/stream",
    summary="Send a message and stream the AI Teacher response as Server-Sent Events",
)
def stream_message(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: TeacherMessageSend,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> StreamingResponse:
    try:
        stream_iter = service.stream_message(
            document_id=document_id,
            conversation_id=conversation_id,
            clerk_user_id=current_user.user_id,
            content=payload.content,
            client_message_id=payload.client_message_id,
            is_voice_mode=payload.is_voice_mode,
        )
        return StreamingResponse(
            stream_iter,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except (ExtractionNotCompletedError, EmptyDocumentContextError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ---------------------------------------------------------------------------
# 8. Retry Failed Message
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/conversations/{conversation_id}/messages/{message_id}/retry",
    response_model=TeacherMessageResponse,
    summary="Retry a failed assistant message response",
)
def retry_message(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Any:
    try:
        _user_msg, assistant_msg = service.retry_message(
            document_id=document_id,
            conversation_id=conversation_id,
            clerk_user_id=current_user.user_id,
            message_id=message_id,
        )
        return assistant_msg
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except AIProviderError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except Exception as exc:
        logger.error("Unexpected error in teacher retry_message: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retry AI response.")


# ---------------------------------------------------------------------------
# 9. Synthesize Voice Speech (Phase 9.1 Edge TTS)
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/conversations/{conversation_id}/messages/{message_id}/speech",
    summary="Synthesize Microsoft Edge TTS speech audio for a completed assistant message",
)
async def synthesize_message_speech(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    payload: TeacherSpeechRequest | None = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Response:
    try:
        # 1. Authorize document access & conversation ownership
        service.verify_document_access(document_id, current_user.user_id)
        conv = service.get_conversation_or_raise(document_id, conversation_id, current_user.user_id)

        # 2. Retrieve message and verify membership
        message = service.get_message_or_raise(conversation_id, message_id)

        # 3. Only completed assistant messages can be synthesized
        if message.role != "assistant":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Speech synthesis is only available for AI Teacher assistant messages.",
            )
        if message.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot synthesize speech for message with status '{message.status}'. Message must be completed.",
            )
        if not message.content or not message.content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assistant message has empty content.",
            )

        # 4. Resolve voice and speech rate
        req_voice = payload.voice if payload else None
        req_rate = payload.rate if payload else "+0%"

        tts_service = EdgeTTSService()
        audio_bytes = await tts_service.synthesize(
            text=message.content,
            voice=req_voice,
            rate=req_rate,
        )

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Type": "audio/mpeg",
                "Content-Length": str(len(audio_bytes)),
                "Cache-Control": "private, no-cache, no-store, must-revalidate",
                "Content-Disposition": f'inline; filename="speech_{message_id}.mp3"',
            },
        )
    except (DocumentNotAccessibleError, ConversationNotFoundError, MessageNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except TTSValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except TTSServiceError as exc:
        logger.error("Edge TTS synthesis service error for message %s: %s", message_id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error in synthesize_message_speech: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate speech audio.",
        )


# ---------------------------------------------------------------------------
# 10. Synthesize Streaming Sentence/Chunk Speech (Real-time TTS Streaming)
# ---------------------------------------------------------------------------


@router.post(
    "/{document_id}/conversations/{conversation_id}/speech",
    summary="Synthesize Edge TTS speech audio for real-time streaming sentence or text chunk",
)
async def synthesize_streaming_speech(
    document_id: uuid.UUID,
    conversation_id: uuid.UUID,
    payload: TeacherSpeechRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: TeacherChatService = Depends(get_teacher_service),
) -> Response:
    try:
        service.verify_document_access(document_id, current_user.user_id)
        service.get_conversation_or_raise(document_id, conversation_id, current_user.user_id)

        raw_text = payload.text.strip() if payload.text else ""
        if not raw_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Text snippet is required for streaming speech synthesis.",
            )

        tts_service = EdgeTTSService()
        audio_bytes = await tts_service.synthesize(
            text=raw_text,
            voice=payload.voice,
            rate=payload.rate,
        )

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Type": "audio/mpeg",
                "Content-Length": str(len(audio_bytes)),
                "Cache-Control": "private, no-cache, no-store, must-revalidate",
            },
        )
    except (DocumentNotAccessibleError, ConversationNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except TTSValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except TTSServiceError as exc:
        logger.error("Edge TTS streaming speech synthesis failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error in synthesize_streaming_speech: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate streaming speech audio.",
        )
