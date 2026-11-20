"""Pydantic schemas for Phase 8 study workspace progress, bookmarks, quizzes, and search."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class FlashcardProgressUpdateRequest(BaseModel):
    """Payload for submitting flashcard study interaction outcome."""

    result: Literal["known", "learning", "again"] = Field(
        ...,
        description="Review outcome: 'known' (mastered/familiar), 'learning' (in progress), or 'again' (re-test)",
    )


class FlashcardProgressResponse(BaseModel):
    """Detailed progress and mastery level for a single flashcard."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clerk_user_id: str
    document_id: uuid.UUID
    resource_id: uuid.UUID
    card_id: str
    mastery_level: int = Field(ge=0, le=3, description="0=Not studied, 1=Learning, 2=Familiar, 3=Mastered")
    review_count: int
    correct_count: int
    incorrect_count: int
    last_reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class FlashcardProgressListResponse(BaseModel):
    """Summary and card-level progress for the active flashcard resource."""

    document_id: uuid.UUID
    resource_id: uuid.UUID | None = None
    total_cards: int = 0
    reviewed_cards: int = 0
    mastered_cards: int = 0
    learning_cards: int = 0
    items: list[FlashcardProgressResponse] = Field(default_factory=list)


class QuestionBookmarkCreateRequest(BaseModel):
    """Payload for bookmarking a specific question."""

    resource_id: uuid.UUID = Field(..., description="ID of the questions StudyResource")
    question_id: str = Field(..., min_length=1, max_length=64, description="Question ID to bookmark")


class QuestionBookmarkResponse(BaseModel):
    """Details of a saved question bookmark."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    clerk_user_id: str
    document_id: uuid.UUID
    resource_id: uuid.UUID
    question_id: str
    created_at: datetime


class QuestionBookmarkDeleteResponse(BaseModel):
    """Response returned upon removing a bookmark."""

    id: uuid.UUID
    deleted: bool = True
    message: str = "Bookmark removed successfully"


class QuizAttemptSummaryResponse(BaseModel):
    """Summary of a completed quiz attempt for history lists."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    resource_id: uuid.UUID
    total_questions: int
    correct_answers: int
    score_percentage: float
    completed_at: datetime


class QuizAttemptDetailResponse(BaseModel):
    """Complete record of a historical quiz attempt including submitted and graded answers."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    resource_id: uuid.UUID
    total_questions: int
    correct_answers: int
    score_percentage: float
    submitted_answers: dict[str, Any]
    graded_result: list[dict[str, Any]] | dict[str, Any] | list[Any]
    completed_at: datetime


class StudyProgressOverviewResponse(BaseModel):
    """Aggregated study activity and mastery statistics for a document."""

    document_id: uuid.UUID
    total_flashcards: int = 0
    reviewed_flashcards: int = 0
    mastered_flashcards: int = 0
    learning_flashcards: int = 0
    bookmarked_questions_count: int = 0
    quiz_attempts_count: int = 0
    latest_quiz_score: float | None = None
    best_quiz_score: float | None = None
    last_studied_at: datetime | None = None


class SearchResultItem(BaseModel):
    """A match item from searching generated study resources."""

    resource_type: str = Field(..., description="Resource type: notes, summary, questions, flashcards, or quiz")
    title: str = Field(..., description="Title or section heading of the matched item")
    snippet: str = Field(..., description="Excerpt showing match context")
    match_field: str = Field(..., description="Field where match occurred: heading, content, term, question, card, etc.")
    target_id: str | None = Field(default=None, description="Optional target identifier for deep linking")
    source_pages: list[int] = Field(default_factory=list, description="Associated original document pages")


class DocumentSearchResponse(BaseModel):
    """Results of searching within a document's generated study materials."""

    document_id: uuid.UUID
    query: str
    total_results: int
    results: list[SearchResultItem] = Field(default_factory=list)
