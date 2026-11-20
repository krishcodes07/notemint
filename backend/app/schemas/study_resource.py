"""API schemas for Phase 7 AI generation endpoints."""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field

from app.ai.schemas import (
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from app.models.study_resource import ResourceType


class GenerateResourcesRequest(BaseModel):
    """Request payload to initiate AI generation for selected resource types."""

    resource_types: list[ResourceType] = Field(
        default_factory=lambda: [
            ResourceType.NOTES,
            ResourceType.QUESTIONS,
            ResourceType.FLASHCARDS,
            ResourceType.QUIZ,
            ResourceType.SUMMARY,
        ],
        description="List of study resource types to synthesize",
    )


class StudyResourceJobResponse(BaseModel):
    """Status summary for a newly enqueued generation job."""

    resource_id: uuid.UUID
    resource_type: str
    status: str
    version: int
    is_active: bool


class GenerateResourcesResponse(BaseModel):
    """Response returned when generation jobs are accepted."""

    document_id: uuid.UUID
    enqueued_count: int
    message: str
    jobs: list[StudyResourceJobResponse]


class StudyResourceResponse(BaseModel):
    """Complete study resource object for workspace rendering."""

    id: uuid.UUID
    document_id: uuid.UUID
    resource_type: str
    status: str
    content: dict[str, Any] | None = None
    model_name: str
    prompt_version: str
    version: int
    is_active: bool
    input_tokens: int | None = None
    output_tokens: int | None = None
    error_message: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class GenerationStatusItem(BaseModel):
    """Generation status details for one resource type."""

    resource_id: str | None = None
    status: str
    version: int
    is_active: bool
    error_message: str | None = None
    updated_at: str | None = None


class DocumentGenerationStatusResponse(BaseModel):
    """Aggregate generation status for all resource types of a document."""

    document_id: uuid.UUID
    document_status: str
    resources: dict[str, GenerationStatusItem]


__all__ = [
    "DocumentGenerationStatusResponse",
    "GenerateResourcesRequest",
    "GenerateResourcesResponse",
    "GenerationStatusItem",
    "QuizSubmissionRequest",
    "QuizSubmissionResponse",
    "StudyResourceJobResponse",
    "StudyResourceResponse",
]

