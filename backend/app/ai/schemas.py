"""Pydantic schemas for AI-generated study materials and validation."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.study_resource import ResourceStatus, ResourceType


# ---------------------------------------------------------------------------
# 1. Smart Notes Schema
# ---------------------------------------------------------------------------


class NoteSection(BaseModel):
    """A thematic section within smart notes."""

    heading: str = Field(..., min_length=1, max_length=256, description="Topic heading")
    content: str = Field(..., min_length=10, description="Clear explanatory content")
    key_points: list[str] = Field(
        default_factory=list,
        description="Key revision bullet points",
    )
    source_pages: list[int] = Field(
        default_factory=list,
        description="Original PDF page numbers",
    )


class KeyTerm(BaseModel):
    """A domain definition or formula grounded in the text."""

    term: str = Field(..., min_length=1, max_length=128, description="Terminology or concept name")
    definition: str = Field(..., min_length=5, description="Clear, accurate definition")
    source_pages: list[int] = Field(
        default_factory=list,
        description="Original PDF page numbers",
    )


class NotesContent(BaseModel):
    """Top-level structured smart notes."""

    title: str = Field(..., min_length=1, max_length=256, description="Chapter or document title")
    overview: str = Field(..., min_length=10, description="Concise chapter overview")
    sections: list[NoteSection] = Field(..., min_length=1, description="Organized study sections")
    key_terms: list[KeyTerm] = Field(default_factory=list, description="Core vocabulary and definitions")


# ---------------------------------------------------------------------------
# 2. Important Questions Schema
# ---------------------------------------------------------------------------


class QuestionItem(BaseModel):
    """Important conceptual or exam question with model answer."""

    id: str = Field(
        default_factory=lambda: f"q_{uuid.uuid4().hex[:8]}",
        description="Stable question identifier",
    )
    question: str = Field(..., min_length=5, description="Question text")
    answer: str = Field(..., min_length=5, description="Model answer")
    answer_type: Literal["very_short", "short", "long"] = Field(
        default="short",
        description="Expected answer length",
    )
    difficulty: Literal["easy", "medium", "hard"] = Field(
        default="medium",
        description="Pedagogical difficulty level",
    )
    source_pages: list[int] = Field(
        default_factory=list,
        description="Original PDF page numbers",
    )
    important_points: list[str] = Field(
        default_factory=list,
        description="Key marking points or keywords",
    )


class QuestionsContent(BaseModel):
    """Top-level important questions collection."""

    title: str = Field(..., min_length=1, max_length=256)
    questions: list[QuestionItem] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# 3. Flashcards Schema
# ---------------------------------------------------------------------------


class FlashcardItem(BaseModel):
    """Active-recall flashcard for spaced repetition."""

    id: str = Field(
        default_factory=lambda: f"fc_{uuid.uuid4().hex[:8]}",
        description="Stable flashcard identifier",
    )
    front: str = Field(..., min_length=2, description="Prompt, question, or term")
    back: str = Field(..., min_length=2, description="Concise answer or explanation")
    difficulty: Literal["easy", "medium", "hard"] = Field(
        default="medium",
        description="Card difficulty",
    )
    source_pages: list[int] = Field(
        default_factory=list,
        description="Original PDF page numbers",
    )


class FlashcardsContent(BaseModel):
    """Top-level collection of flashcards."""

    title: str = Field(..., min_length=1, max_length=256)
    cards: list[FlashcardItem] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# 4. MCQ Quiz Schema
# ---------------------------------------------------------------------------


class QuizQuestionItem(BaseModel):
    """A 4-option multiple choice question."""

    id: str = Field(
        default_factory=lambda: f"mcq_{uuid.uuid4().hex[:8]}",
        description="Stable question identifier",
    )
    question: str = Field(..., min_length=5, description="Question text")
    options: list[str] = Field(..., description="Exactly four plausible answer options")
    correct_option_index: int = Field(
        ...,
        ge=0,
        le=3,
        description="Zero-based index of the correct option (0, 1, 2, or 3)",
    )
    explanation: str = Field(
        ...,
        min_length=5,
        description="Detailed pedagogical explanation of why this answer is correct",
    )
    difficulty: Literal["easy", "medium", "hard"] = Field(
        default="medium",
        description="Question difficulty",
    )
    source_pages: list[int] = Field(
        default_factory=list,
        description="Original PDF page numbers",
    )

    @field_validator("options")
    @classmethod
    def validate_options_count(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError(f"MCQ questions must have exactly 4 options, got {len(v)}")
        for idx, opt in enumerate(v):
            if not opt or not str(opt).strip():
                raise ValueError(f"Option at index {idx} cannot be empty")
        return [str(opt).strip() for opt in v]


class QuizContent(BaseModel):
    """Top-level multiple choice quiz collection."""

    title: str = Field(..., min_length=1, max_length=256)
    questions: list[QuizQuestionItem] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# 5. Chapter Summary Schema
# ---------------------------------------------------------------------------


class TopicSummary(BaseModel):
    """Summary of a specific major topic in the chapter."""

    topic: str = Field(..., min_length=1, max_length=256)
    summary: str = Field(..., min_length=10)
    source_pages: list[int] = Field(default_factory=list)


class SummaryContent(BaseModel):
    """Top-level chapter summary."""

    title: str = Field(..., min_length=1, max_length=256)
    overview: str = Field(..., min_length=10)
    main_topics: list[TopicSummary] = Field(..., min_length=1)
    key_takeaways: list[str] = Field(..., min_length=1)
    revision_summary: str = Field(..., min_length=10)


# ---------------------------------------------------------------------------
# 6. Quiz Evaluation & Grading Schemas
# ---------------------------------------------------------------------------


class QuizSubmissionRequest(BaseModel):
    """Student's submitted answers mapping question ID to selected option index."""

    answers: dict[str, int] = Field(
        ...,
        description="Map of question ID (e.g. 'mcq_1234') to selected option index (0..3)",
    )


class QuestionGradeResult(BaseModel):
    """Server-evaluated grade result for a single quiz question."""

    question_id: str
    question: str
    options: list[str]
    selected_option_index: int | None
    correct_option_index: int
    is_correct: bool
    explanation: str
    source_pages: list[int]


class QuizSubmissionResponse(BaseModel):
    """Complete server-graded evaluation with explanations revealed."""

    resource_id: uuid.UUID
    total_questions: int
    answered_questions: int
    correct_answers: int
    score_percentage: float
    results: list[QuestionGradeResult]
    attempt_id: uuid.UUID | None = None
    completed_at: datetime | None = None


# ---------------------------------------------------------------------------
# 7. Safe Client Sanitization
# ---------------------------------------------------------------------------


def sanitize_quiz_content_for_client(content: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip correct answers and explanations before sending active quiz to browser."""
    if not content or "questions" not in content:
        return content

    sanitized = {
        "title": content.get("title", "Practice Quiz"),
        "questions": [],
    }
    for q in content.get("questions", []):
        sanitized["questions"].append({
            "id": q.get("id"),
            "question": q.get("question"),
            "options": q.get("options", []),
            "difficulty": q.get("difficulty", "medium"),
            "source_pages": q.get("source_pages", []),
            # OMIT: correct_option_index and explanation
        })
    return sanitized

