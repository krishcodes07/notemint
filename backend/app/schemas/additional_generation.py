"""Pydantic schemas for Phase 11 on-demand custom practice and generation batches."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class GenerateMoreRequest(BaseModel):
    """Request payload to generate additional questions, flashcards, or MCQs."""

    resource_type: Literal["questions", "flashcards", "quiz"] = Field(
        ...,
        description="Type of study content to generate: questions, flashcards, quiz",
    )
    difficulty: Literal["easy", "medium", "hard", "random"] = Field(
        default="random",
        description="Cognitive difficulty tier: easy, medium, hard, or random (mixed)",
    )
    count: int = Field(
        default=10,
        ge=1,
        le=30,
        description="Number of items to generate (1 to 30, recommended: 5, 10, 15, 20, 30)",
    )
    topic: str | None = Field(
        default=None,
        max_length=256,
        description="Optional focus topic for generation",
    )

    @field_validator("topic")
    @classmethod
    def sanitize_topic(cls, v: str | None) -> str | None:
        if v is None:
            return None
        cleaned = v.strip()
        return cleaned if cleaned else None


class StudyGenerationBatchResponse(BaseModel):
    """Status and metadata for an immutable on-demand generation batch."""

    id: uuid.UUID
    document_id: uuid.UUID
    resource_id: uuid.UUID | None = None
    resource_type: str
    difficulty: str
    requested_count: int
    generated_count: int
    topic: str | None = None
    status: str
    model_name: str
    prompt_version: str
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class StudyGenerationBatchListResponse(BaseModel):
    """List of generation batches for a document."""

    document_id: uuid.UUID
    total: int
    items: list[StudyGenerationBatchResponse]


class AvailableTopicsResponse(BaseModel):
    """List of available section and summary topics discovered from document materials."""

    document_id: uuid.UUID
    topics: list[str]


class AggregatedQuestionItem(BaseModel):
    """Question item with batch and resource provenance."""

    id: str
    question: str
    answer: str
    answer_type: Literal["very_short", "short", "long"]
    difficulty: Literal["easy", "medium", "hard"]
    source_pages: list[int]
    important_points: list[str]
    resource_id: uuid.UUID
    batch_id: uuid.UUID | None = None
    batch_label: str = "Original"


class AggregatedQuestionsResponse(BaseModel):
    """Unified collection of all questions across original and additional batches."""

    document_id: uuid.UUID
    total_questions: int
    questions: list[AggregatedQuestionItem]
    batches: list[StudyGenerationBatchResponse]


class AggregatedFlashcardItem(BaseModel):
    """Flashcard item with batch and resource provenance."""

    id: str
    front: str
    back: str
    difficulty: Literal["easy", "medium", "hard"]
    source_pages: list[int]
    resource_id: uuid.UUID
    batch_id: uuid.UUID | None = None
    batch_label: str = "Original"


class AggregatedFlashcardsResponse(BaseModel):
    """Unified collection of all flashcards across original and additional batches."""

    document_id: uuid.UUID
    total_cards: int
    cards: list[AggregatedFlashcardItem]
    batches: list[StudyGenerationBatchResponse]


class QuizPracticeSetSummary(BaseModel):
    """Metadata for a discrete quiz practice set."""

    set_id: str
    title: str
    question_count: int
    difficulty: str
    topic: str | None = None
    resource_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    created_at: datetime | None = None


class AggregatedQuizQuestionItem(BaseModel):
    """Sanitized MCQ question with batch and resource provenance."""

    id: str
    question: str
    options: list[str]
    difficulty: Literal["easy", "medium", "hard"]
    source_pages: list[int]
    resource_id: uuid.UUID
    batch_id: uuid.UUID | None = None
    batch_label: str = "Original"


class AggregatedQuizResponse(BaseModel):
    """Unified practice sets and sanitized questions for the quiz workspace."""

    document_id: uuid.UUID
    practice_sets: list[QuizPracticeSetSummary]
    questions: list[AggregatedQuizQuestionItem]
    batches: list[StudyGenerationBatchResponse]


class SubmitPracticeSetQuizRequest(BaseModel):
    """Student submission for an entire practice set or all questions."""

    practice_set_id: str = Field(
        ...,
        description="'all' for all combined questions or the specific resource UUID of a practice set",
    )
    answers: dict[str, int] = Field(
        ...,
        description="Map of question ID to chosen option index (0..3)",
    )

