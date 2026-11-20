"""API endpoints for AI Study Resource generation, viewing, and grading."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.base import BaseAIProvider
from app.ai.provider_factory import get_ai_provider
from app.ai.schemas import (
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.models.study_resource import ResourceType
from app.schemas.auth import AuthenticatedUser
from app.schemas.study_resource import (
    DocumentGenerationStatusResponse,
    GenerateResourcesRequest,
    GenerateResourcesResponse,
    StudyResourceJobResponse,
    StudyResourceResponse,
)
from app.services.ai_generation_service import (
    AIGenerationService,
    DocumentNotFoundError,
    GenerationInProgressError,
    ResourceNotFoundError,
)
from app.services.document_context_service import ExtractionNotCompletedError
from app.tasks.ai_generation_tasks import enqueue_ai_generation_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["study-resources"])


def get_ai_generation_service(
    session: Session = Depends(get_db),
    provider: BaseAIProvider = Depends(get_ai_provider),
) -> AIGenerationService:
    """Dependency provider for AIGenerationService."""
    return AIGenerationService(session=session, provider=provider)


@router.post(
    "/{document_id}/generate",
    response_model=GenerateResourcesResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate AI study materials for an extracted document",
)
def generate_study_resources(
    document_id: uuid.UUID,
    payload: GenerateResourcesRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AIGenerationService = Depends(get_ai_generation_service),
) -> GenerateResourcesResponse:
    """Initiate background generation of study materials (Notes, Questions, Flashcards, Quiz, Summary).

    Requires verified ownership and completed PDF extraction.
    """
    if not payload.resource_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one resource type must be requested.",
        )

    try:
        jobs = service.initialize_generation_jobs(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_types=payload.resource_types,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ExtractionNotCompletedError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None

    job_responses: list[StudyResourceJobResponse] = []
    for job in jobs:
        # Enqueue background task
        enqueue_ai_generation_task(
            document_id=document_id,
            resource_type=job.resource_type,
            resource_id=job.id,
        )
        job_responses.append(
            StudyResourceJobResponse(
                resource_id=job.id,
                resource_type=job.resource_type.value,
                status=job.status.value,
                version=job.version,
                is_active=job.is_active,
            )
        )

    return GenerateResourcesResponse(
        document_id=document_id,
        enqueued_count=len(job_responses),
        message=f"Enqueued {len(job_responses)} study material generation jobs.",
        jobs=job_responses,
    )


@router.get(
    "/{document_id}/resources",
    response_model=list[StudyResourceResponse],
    summary="List active study resources for a document",
)
def list_document_study_resources(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AIGenerationService = Depends(get_ai_generation_service),
) -> list[StudyResourceResponse]:
    """Retrieve all currently active study resources for an authenticated user's document.

    Active quiz question answer keys and explanations are sanitized to prevent client cheating.
    """
    try:
        resources = service.list_active_resources(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            sanitize_quiz=True,
        )
        return [StudyResourceResponse.model_validate(r) for r in resources]
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/resources/{resource_id}",
    response_model=StudyResourceResponse,
    summary="Retrieve a specific study resource",
)
def get_study_resource(
    document_id: uuid.UUID,
    resource_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AIGenerationService = Depends(get_ai_generation_service),
) -> StudyResourceResponse:
    """Retrieve full content of a specific study resource.

    Answer keys for active quizzes are sanitized until submitted.
    """
    try:
        resource = service.get_resource_by_id(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=resource_id,
            sanitize_quiz=True,
        )
        return StudyResourceResponse.model_validate(resource)
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study resource not found",
        ) from None


@router.post(
    "/{document_id}/resources/{resource_type}/regenerate",
    response_model=StudyResourceJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Regenerate a specific study resource",
)
def regenerate_study_resource(
    document_id: uuid.UUID,
    resource_type: ResourceType,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AIGenerationService = Depends(get_ai_generation_service),
) -> StudyResourceJobResponse:
    """Generate a replacement version for a resource without deleting the existing active version.

    The previous successful version remains active and viewable until the new generation succeeds.
    """
    try:
        new_resource = service.regenerate_resource(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_type=resource_type,
        )
        enqueue_ai_generation_task(
            document_id=document_id,
            resource_type=resource_type,
            resource_id=new_resource.id,
        )
        return StudyResourceJobResponse(
            resource_id=new_resource.id,
            resource_type=new_resource.resource_type.value,
            status=new_resource.status.value,
            version=new_resource.version,
            is_active=new_resource.is_active,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except GenerationInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from None


@router.get(
    "/{document_id}/generation-status",
    response_model=DocumentGenerationStatusResponse,
    summary="Get generation progress for all resource types",
)
def get_document_generation_status(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AIGenerationService = Depends(get_ai_generation_service),
) -> DocumentGenerationStatusResponse:
    """Poll the status of all study resources for a document."""
    try:
        raw_status = service.get_generation_status(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
        return DocumentGenerationStatusResponse.model_validate(raw_status)
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.post(
    "/{document_id}/quiz/{resource_id}/submit",
    response_model=QuizSubmissionResponse,
    summary="Submit answers for server-side quiz grading",
)
def submit_quiz_for_grading(
    document_id: uuid.UUID,
    resource_id: uuid.UUID,
    payload: QuizSubmissionRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AIGenerationService = Depends(get_ai_generation_service),
) -> QuizSubmissionResponse:
    """Submit student quiz choices for server-side evaluation and feedback.

    Compares answers against stored answer key, calculates score, and reveals explanations.
    """
    try:
        return service.grade_quiz(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=resource_id,
            user_answers=payload.answers,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz resource not found",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None
