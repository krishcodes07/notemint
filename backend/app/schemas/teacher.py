"""Pydantic schemas for Phase 9 AI Teacher chat tutor."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


TeachingMode = Literal["explain", "simplify", "socratic"]
ExplanationDepth = Literal["quick", "standard", "detailed"]
PreferredLanguage = Literal["auto", "en", "hi", "hinglish"]


class TeacherConversationCreate(BaseModel):
    """Payload to create a new AI Teacher conversation for a document."""

    title: str | None = Field(
        default=None,
        max_length=256,
        description="Optional title for the conversation; defaults to 'New Conversation'",
    )
    teaching_mode: TeachingMode = Field(
        default="explain",
        description="Pedagogical style: explain, simplify, socratic",
    )
    explanation_depth: ExplanationDepth = Field(
        default="standard",
        description="Depth of explanations: quick, standard, detailed",
    )
    preferred_language: PreferredLanguage = Field(
        default="auto",
        description="Language preference: auto, en, hi, hinglish",
    )


class TeacherConversationUpdate(BaseModel):
    """Payload to update an existing conversation's settings or title."""

    title: str | None = Field(default=None, max_length=256)
    teaching_mode: TeachingMode | None = None
    explanation_depth: ExplanationDepth | None = None
    preferred_language: PreferredLanguage | None = None


class TeacherMessageSend(BaseModel):
    """Payload to send a student message to the AI Teacher."""

    content: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="Student doubt or question text",
    )
    client_message_id: str | None = Field(
        default=None,
        max_length=128,
        description="Optional client-generated UUID for idempotent submission / retry",
    )
    is_voice_mode: bool = Field(
        default=False,
        description="Whether message was asked via voice mode for conversational speech tuning",
    )


class TeacherSpeechRequest(BaseModel):
    """Payload to request Edge TTS speech synthesis for an assistant message or streaming chunk."""

    text: str | None = Field(
        default=None,
        description="Optional direct text snippet to synthesize for real-time streaming TTS",
        max_length=5000,
    )
    voice: str = Field(
        default="en-IN-NeerjaNeural",
        description="Edge TTS neural voice identifier",
        max_length=64,
    )
    rate: str = Field(
        default="+0%",
        description="Speech rate adjustment string, e.g. '+0%', '-10%', '+20%'",
        max_length=8,
    )


class TeacherMessageResponse(BaseModel):
    """Response model for an AI Teacher conversation message."""

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    source_pages: list[int] | None = None
    model_name: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    status: Literal["completed", "processing", "failed"]
    error_message: str | None = None
    client_message_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TeacherConversationResponse(BaseModel):
    """Summary response for an AI Teacher conversation."""

    id: uuid.UUID
    document_id: uuid.UUID
    clerk_user_id: str
    title: str
    teaching_mode: str
    explanation_depth: str
    preferred_language: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TeacherConversationDetailResponse(TeacherConversationResponse):
    """Full detail of an AI Teacher conversation including chronological messages."""

    messages: list[TeacherMessageResponse] = Field(default_factory=list)


class TeacherConversationListResponse(BaseModel):
    """Paginated list of teacher conversations."""

    items: list[TeacherConversationResponse]
    total: int
    limit: int
    offset: int

