"""API endpoints for Phase 11 on-demand custom practice generation and aggregation."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.base import BaseAIProvider
from app.ai.provider_factory import get_ai_provider
from app.ai.schemas import QuizSubmissionResponse
from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.schemas.additional_generation import (
    AggregatedFlashcardsResponse,
    AggregatedQuestionsResponse,
    AggregatedQuizResponse,
    AvailableTopicsResponse,
    GenerateMoreRequest,
    StudyGenerationBatchListResponse,
    StudyGenerationBatchResponse,
    SubmitPracticeSetQuizRequest,
)
from app.schemas.auth import AuthenticatedUser
from app.services.additional_generation_service import AdditionalGenerationService
from app.services.ai_generation_service import (
    DocumentNotFoundError,
    GenerationInProgressError,
    ResourceNotFoundError,
)
from app.services.document_context_service import ExtractionNotCompletedError
from app.tasks.ai_generation_tasks import enqueue_additional_generation_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["custom-practice"])


def get_additional_generation_service(
    session: Session = Depends(get_db),
    provider: BaseAIProvider = Depends(get_ai_provider),
) -> AdditionalGenerationService:
    """Dependency provider for AdditionalGenerationService."""
    return AdditionalGenerationService(session=session, provider=provider)


@router.post(
    "/{document_id}/generate-more",
    response_model=StudyGenerationBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Generate additional questions, flashcards, or MCQs",
)
def generate_more_study_items(
    document_id: uuid.UUID,
    payload: GenerateMoreRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> StudyGenerationBatchResponse:
    """Enqueues an asynchronous generation batch for additional practice material.

    Difficulty options: 'easy', 'medium', 'hard', 'random'.
    Non-destructive: new content appends to existing material without resetting.
    """
    try:
        batch = service.create_generation_batch(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_type=payload.resource_type,
            difficulty=payload.difficulty,
            count=payload.count,
            topic=payload.topic,
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
    except GenerationInProgressError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None

    # Enqueue background execution
    enqueue_additional_generation_task(
        document_id=document_id,
        batch_id=batch.id,
    )

    return StudyGenerationBatchResponse.model_validate(batch)


@router.get(
    "/{document_id}/generation-batches",
    response_model=StudyGenerationBatchListResponse,
    summary="List all on-demand generation batches for a document",
)
def list_generation_batches(
    document_id: uuid.UUID,
    resource_type: str | None = Query(None, description="Optional filter by resource type: questions, flashcards, quiz"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> StudyGenerationBatchListResponse:
    """List generation batch history and status for a document."""
    try:
        batches = service.list_generation_batches(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_type=resource_type,
        )
        return StudyGenerationBatchListResponse(
            document_id=document_id,
            total=len(batches),
            items=batches,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/generation-batches/{batch_id}",
    response_model=StudyGenerationBatchResponse,
    summary="Get status and details of a specific generation batch",
)
def get_generation_batch(
    document_id: uuid.UUID,
    batch_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> StudyGenerationBatchResponse:
    """Retrieve the current processing status and details of a generation batch."""
    try:
        return service.get_generation_batch(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            batch_id=batch_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Generation batch not found",
        ) from None


@router.get(
    "/{document_id}/topics",
    response_model=AvailableTopicsResponse,
    summary="Get available section and summary topics for focused generation",
)
def get_available_topics(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> AvailableTopicsResponse:
    """Discover available topics from active Notes sections and Chapter Summary."""
    try:
        return service.get_available_topics(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/aggregated/questions",
    response_model=AggregatedQuestionsResponse,
    summary="Retrieve all questions across original and additional batches",
)
def get_aggregated_questions(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> AggregatedQuestionsResponse:
    """Retrieve unified list of questions with batch origin and difficulty metadata."""
    try:
        return service.get_aggregated_questions(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/aggregated/flashcards",
    response_model=AggregatedFlashcardsResponse,
    summary="Retrieve all flashcards across original and additional batches",
)
def get_aggregated_flashcards(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> AggregatedFlashcardsResponse:
    """Retrieve unified list of flashcards with batch origin and difficulty metadata."""
    try:
        return service.get_aggregated_flashcards(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/aggregated/quiz",
    response_model=AggregatedQuizResponse,
    summary="Retrieve practice sets and sanitized questions for the quiz workspace",
)
def get_aggregated_quiz(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> AggregatedQuizResponse:
    """Retrieve quiz practice sets ('All Questions', 'Original Quiz', and batches) with answers hidden."""
    try:
        return service.get_aggregated_quiz(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.post(
    "/{document_id}/quiz/submit",
    response_model=QuizSubmissionResponse,
    summary="Server-side grading for a quiz practice set or all questions",
)
def submit_practice_set_quiz(
    document_id: uuid.UUID,
    payload: SubmitPracticeSetQuizRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: AdditionalGenerationService = Depends(get_additional_generation_service),
) -> QuizSubmissionResponse:
    """Submit student answers for server-side evaluation and historical attempt recording."""
    try:
        return service.grade_practice_set_quiz(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            practice_set_id=payload.practice_set_id,
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
            detail="Practice set resource not found",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None

