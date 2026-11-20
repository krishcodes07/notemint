"""API endpoints for student study progress, flashcard mastery, question bookmarks, quiz history, and search."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.schemas.auth import AuthenticatedUser
from app.schemas.study_progress import (
    DocumentSearchResponse,
    FlashcardProgressListResponse,
    FlashcardProgressResponse,
    FlashcardProgressUpdateRequest,
    QuestionBookmarkCreateRequest,
    QuestionBookmarkDeleteResponse,
    QuestionBookmarkResponse,
    QuizAttemptDetailResponse,
    QuizAttemptSummaryResponse,
    StudyProgressOverviewResponse,
)
from app.services.ai_generation_service import (
    DocumentNotFoundError,
    ResourceNotFoundError,
)
from app.services.study_progress_service import StudyProgressService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["study-progress"])


def get_study_progress_service(
    session: Session = Depends(get_db),
) -> StudyProgressService:
    """Dependency provider for StudyProgressService."""
    return StudyProgressService(session=session)


# -----------------------------------------------------------------------------
# 1. Flashcard Mastery
# -----------------------------------------------------------------------------


@router.get(
    "/{document_id}/flashcard-progress",
    response_model=FlashcardProgressListResponse,
    summary="Get flashcard progress and mastery levels for a document",
)
def get_flashcard_progress(
    document_id: uuid.UUID,
    resource_id: uuid.UUID | None = Query(None, description="Optional specific flashcards resource ID"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> FlashcardProgressListResponse:
    """Retrieve saved flashcard mastery levels for the active or requested flashcard set."""
    try:
        return service.get_flashcard_progress(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=resource_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flashcard resource not found",
        ) from None


@router.put(
    "/{document_id}/flashcards/{resource_id}/{card_id}/progress",
    response_model=FlashcardProgressResponse,
    summary="Update flashcard mastery status",
)
def update_flashcard_progress(
    document_id: uuid.UUID,
    resource_id: uuid.UUID,
    card_id: str,
    payload: FlashcardProgressUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> FlashcardProgressResponse:
    """Record student outcome on a flashcard ('known', 'learning', or 'again')."""
    try:
        return service.update_flashcard_progress(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=resource_id,
            card_id=card_id,
            result=payload.result,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flashcard resource not found",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None


# -----------------------------------------------------------------------------
# 2. Question Bookmarks
# -----------------------------------------------------------------------------


@router.get(
    "/{document_id}/bookmarks",
    response_model=list[QuestionBookmarkResponse],
    summary="List question bookmarks for a document",
)
def list_question_bookmarks(
    document_id: uuid.UUID,
    resource_id: uuid.UUID | None = Query(None, description="Optional filter by questions resource ID"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> list[QuestionBookmarkResponse]:
    """List bookmarked questions for revision."""
    try:
        return service.list_bookmarks(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=resource_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.post(
    "/{document_id}/bookmarks",
    response_model=QuestionBookmarkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Bookmark a question",
)
def create_question_bookmark(
    document_id: uuid.UUID,
    payload: QuestionBookmarkCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> QuestionBookmarkResponse:
    """Bookmark an exam question for later review."""
    try:
        return service.add_bookmark(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=payload.resource_id,
            question_id=payload.question_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question resource not found",
        ) from None
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None


@router.delete(
    "/{document_id}/bookmarks/{bookmark_id}",
    response_model=QuestionBookmarkDeleteResponse,
    summary="Remove a question bookmark",
)
def delete_question_bookmark(
    document_id: uuid.UUID,
    bookmark_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> QuestionBookmarkDeleteResponse:
    """Remove a previously saved question bookmark."""
    try:
        service.remove_bookmark(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            bookmark_id=bookmark_id,
        )
        return QuestionBookmarkDeleteResponse(id=bookmark_id)
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bookmark not found",
        ) from None


# -----------------------------------------------------------------------------
# 3. Quiz Attempts & History
# -----------------------------------------------------------------------------


@router.get(
    "/{document_id}/quiz-attempts",
    response_model=list[QuizAttemptSummaryResponse],
    summary="List historical quiz attempts for a document",
)
def list_quiz_attempts(
    document_id: uuid.UUID,
    resource_id: uuid.UUID | None = Query(None, description="Optional filter by quiz resource ID"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> list[QuizAttemptSummaryResponse]:
    """Retrieve all completed quiz attempts for the document, newest first."""
    try:
        return service.list_quiz_attempts(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            resource_id=resource_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


@router.get(
    "/{document_id}/quiz-attempts/{attempt_id}",
    response_model=QuizAttemptDetailResponse,
    summary="Retrieve details of a specific historical quiz attempt",
)
def get_quiz_attempt(
    document_id: uuid.UUID,
    attempt_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> QuizAttemptDetailResponse:
    """Retrieve full breakdown and answer choices for a completed quiz attempt."""
    try:
        return service.get_quiz_attempt(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            attempt_id=attempt_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None
    except ResourceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz attempt not found",
        ) from None


# -----------------------------------------------------------------------------
# 4. Study Progress Overview
# -----------------------------------------------------------------------------


@router.get(
    "/{document_id}/study-progress",
    response_model=StudyProgressOverviewResponse,
    summary="Get overall study progress summary for a document",
)
def get_study_progress_overview(
    document_id: uuid.UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> StudyProgressOverviewResponse:
    """Return aggregated flashcard mastery, question bookmarks, and quiz performance metrics."""
    try:
        return service.get_progress_overview(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None


# -----------------------------------------------------------------------------
# 5. Search Across Generated Materials
# -----------------------------------------------------------------------------


@router.get(
    "/{document_id}/search",
    response_model=DocumentSearchResponse,
    summary="Search within generated study resources",
)
def search_document_study_resources(
    document_id: uuid.UUID,
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: StudyProgressService = Depends(get_study_progress_service),
) -> DocumentSearchResponse:
    """Search notes, summaries, questions, flashcards, and quiz prompts within this document."""
    try:
        return service.search_study_resources(
            clerk_user_id=current_user.user_id,
            document_id=document_id,
            query=q,
        )
    except DocumentNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        ) from None

