"""Data-access repository for student study progress, bookmarks, quiz attempts, and activities."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.study_progress import (
    ActivityType,
    FlashcardProgress,
    QuestionBookmark,
    QuizAttempt,
    StudyActivity,
)
from app.models.study_resource import ResourceType, StudyResource

logger = logging.getLogger(__name__)


class StudyProgressRepository:
    """Repository handling persistence and aggregation of student learning state."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # -------------------------------------------------------------------------
    # Activity Logging
    # -------------------------------------------------------------------------

    def record_activity(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        activity_type: ActivityType | str,
        resource_id: uuid.UUID | None = None,
        activity_metadata: dict[str, Any] | None = None,
    ) -> StudyActivity:
        """Record a lightweight student study action."""
        val = activity_type.value if isinstance(activity_type, ActivityType) else str(activity_type)
        activity = StudyActivity(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            activity_type=val,
            resource_id=resource_id,
            activity_metadata=activity_metadata,
        )
        self._session.add(activity)
        self._session.flush()
        return activity

    # -------------------------------------------------------------------------
    # Flashcard Progress
    # -------------------------------------------------------------------------

    def get_flashcard_progress(
        self,
        clerk_user_id: str,
        resource_id: uuid.UUID,
        card_id: str,
    ) -> FlashcardProgress | None:
        """Retrieve progress for a specific card."""
        stmt = select(FlashcardProgress).where(
            FlashcardProgress.clerk_user_id == clerk_user_id,
            FlashcardProgress.resource_id == resource_id,
            FlashcardProgress.card_id == card_id,
        )
        return self._session.execute(stmt).scalars().first()

    def update_flashcard_mastery(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        card_id: str,
        result: str,
    ) -> FlashcardProgress:
        """Update review count and mastery level for a flashcard based on outcome."""
        progress = self.get_flashcard_progress(clerk_user_id, resource_id, card_id)
        if not progress:
            progress = FlashcardProgress(
                clerk_user_id=clerk_user_id,
                document_id=document_id,
                resource_id=resource_id,
                card_id=card_id,
                mastery_level=0,
                review_count=0,
                correct_count=0,
                incorrect_count=0,
            )
            self._session.add(progress)

        progress.review_count += 1
        now = datetime.now()
        progress.last_reviewed_at = now

        if result == "known":
            progress.correct_count += 1
            progress.mastery_level = min(progress.mastery_level + 1, 3)
        elif result == "again":
            progress.incorrect_count += 1
            progress.mastery_level = max(0, progress.mastery_level - 1)
        elif result == "learning":
            progress.mastery_level = 1

        self._session.flush()

        # Log activity
        self.record_activity(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            activity_type=ActivityType.FLASHCARD_REVIEWED,
            resource_id=resource_id,
            activity_metadata={"card_id": card_id, "result": result, "mastery_level": progress.mastery_level},
        )

        return progress

    def list_flashcard_progress_for_resource(
        self,
        clerk_user_id: str,
        resource_id: uuid.UUID,
    ) -> list[FlashcardProgress]:
        """List all saved flashcard progress records for a resource."""
        stmt = (
            select(FlashcardProgress)
            .where(
                FlashcardProgress.clerk_user_id == clerk_user_id,
                FlashcardProgress.resource_id == resource_id,
            )
            .order_by(FlashcardProgress.card_id.asc())
        )
        return list(self._session.execute(stmt).scalars())

    # -------------------------------------------------------------------------
    # Question Bookmarks
    # -------------------------------------------------------------------------

    def get_bookmark(
        self,
        clerk_user_id: str,
        resource_id: uuid.UUID,
        question_id: str,
    ) -> QuestionBookmark | None:
        """Find an existing question bookmark."""
        stmt = select(QuestionBookmark).where(
            QuestionBookmark.clerk_user_id == clerk_user_id,
            QuestionBookmark.resource_id == resource_id,
            QuestionBookmark.question_id == question_id,
        )
        return self._session.execute(stmt).scalars().first()

    def get_bookmark_by_id(
        self,
        clerk_user_id: str,
        bookmark_id: uuid.UUID,
    ) -> QuestionBookmark | None:
        """Find a bookmark by primary key, verifying ownership."""
        stmt = select(QuestionBookmark).where(
            QuestionBookmark.id == bookmark_id,
            QuestionBookmark.clerk_user_id == clerk_user_id,
        )
        return self._session.execute(stmt).scalars().first()

    def add_bookmark(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        question_id: str,
    ) -> QuestionBookmark:
        """Add a bookmark for a question if not already bookmarked."""
        existing = self.get_bookmark(clerk_user_id, resource_id, question_id)
        if existing:
            return existing

        bookmark = QuestionBookmark(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource_id,
            question_id=question_id,
        )
        self._session.add(bookmark)
        self._session.flush()

        self.record_activity(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            activity_type=ActivityType.QUESTION_BOOKMARKED,
            resource_id=resource_id,
            activity_metadata={"question_id": question_id},
        )
        return bookmark

    def remove_bookmark(
        self,
        clerk_user_id: str,
        bookmark_id: uuid.UUID,
    ) -> bool:
        """Delete a bookmark by ID."""
        stmt = delete(QuestionBookmark).where(
            QuestionBookmark.id == bookmark_id,
            QuestionBookmark.clerk_user_id == clerk_user_id,
        )
        result = self._session.execute(stmt)
        self._session.flush()
        return (result.rowcount or 0) > 0

    def remove_bookmark_by_question(
        self,
        clerk_user_id: str,
        resource_id: uuid.UUID,
        question_id: str,
    ) -> bool:
        """Delete a bookmark by question identifier."""
        stmt = delete(QuestionBookmark).where(
            QuestionBookmark.clerk_user_id == clerk_user_id,
            QuestionBookmark.resource_id == resource_id,
            QuestionBookmark.question_id == question_id,
        )
        result = self._session.execute(stmt)
        self._session.flush()
        return (result.rowcount or 0) > 0

    def list_bookmarks_by_document(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID | None = None,
    ) -> list[QuestionBookmark]:
        """List question bookmarks for a document."""
        stmt = select(QuestionBookmark).where(
            QuestionBookmark.clerk_user_id == clerk_user_id,
            QuestionBookmark.document_id == document_id,
        )
        if resource_id is not None:
            stmt = stmt.where(QuestionBookmark.resource_id == resource_id)
        stmt = stmt.order_by(QuestionBookmark.created_at.desc())
        return list(self._session.execute(stmt).scalars())

    # -------------------------------------------------------------------------
    # Quiz Attempts
    # -------------------------------------------------------------------------

    def create_quiz_attempt(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        total_questions: int,
        correct_answers: int,
        score_percentage: float,
        submitted_answers: dict[str, Any],
        graded_result: dict[str, Any],
    ) -> QuizAttempt:
        """Persist a completed quiz attempt."""
        attempt = QuizAttempt(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource_id,
            total_questions=total_questions,
            correct_answers=correct_answers,
            score_percentage=score_percentage,
            submitted_answers=submitted_answers,
            graded_result=graded_result,
            completed_at=datetime.now(),
        )
        self._session.add(attempt)
        self._session.flush()

        self.record_activity(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            activity_type=ActivityType.QUIZ_COMPLETED,
            resource_id=resource_id,
            activity_metadata={
                "attempt_id": str(attempt.id),
                "score_percentage": score_percentage,
                "correct_answers": correct_answers,
                "total_questions": total_questions,
            },
        )
        return attempt

    def list_quiz_attempts(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID | None = None,
    ) -> list[QuizAttempt]:
        """List completed quiz attempts in reverse chronological order."""
        stmt = select(QuizAttempt).where(
            QuizAttempt.clerk_user_id == clerk_user_id,
            QuizAttempt.document_id == document_id,
        )
        if resource_id is not None:
            stmt = stmt.where(QuizAttempt.resource_id == resource_id)
        stmt = stmt.order_by(QuizAttempt.completed_at.desc(), QuizAttempt.id.desc())
        return list(self._session.execute(stmt).scalars())

    def get_quiz_attempt(
        self,
        clerk_user_id: str,
        attempt_id: uuid.UUID,
    ) -> QuizAttempt | None:
        """Retrieve a specific quiz attempt with ownership verification."""
        stmt = select(QuizAttempt).where(
            QuizAttempt.id == attempt_id,
            QuizAttempt.clerk_user_id == clerk_user_id,
        )
        return self._session.execute(stmt).scalars().first()

    # -------------------------------------------------------------------------
    # Progress Overview Aggregations
    # -------------------------------------------------------------------------

    def get_study_progress_overview(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        active_flashcards: StudyResource | None,
        active_questions: StudyResource | None,
    ) -> dict[str, Any]:
        """Aggregate user's flashcard mastery, bookmarked questions, and quiz performance."""
        total_flashcards = 0
        reviewed_flashcards = 0
        mastered_flashcards = 0
        learning_flashcards = 0

        if active_flashcards and active_flashcards.content:
            cards = active_flashcards.content.get("cards", [])
            total_flashcards = len(cards)

            # Query progress records for this active flashcard resource
            progress_records = self.list_flashcard_progress_for_resource(
                clerk_user_id=clerk_user_id,
                resource_id=active_flashcards.id,
            )
            for p in progress_records:
                if p.review_count > 0:
                    reviewed_flashcards += 1
                if p.mastery_level == 3:
                    mastered_flashcards += 1
                elif p.mastery_level in (1, 2):
                    learning_flashcards += 1

        # Count active bookmarks
        bookmarked_count = 0
        if active_questions:
            b_stmt = select(func.count(QuestionBookmark.id)).where(
                QuestionBookmark.clerk_user_id == clerk_user_id,
                QuestionBookmark.resource_id == active_questions.id,
            )
            bookmarked_count = int(self._session.execute(b_stmt).scalar() or 0)

        # Quiz attempts aggregates
        q_attempts = self.list_quiz_attempts(clerk_user_id, document_id)
        quiz_attempts_count = len(q_attempts)
        latest_quiz_score: float | None = None
        best_quiz_score: float | None = None

        if q_attempts:
            latest_quiz_score = round(q_attempts[0].score_percentage, 1)
            best_quiz_score = round(max(att.score_percentage for att in q_attempts), 1)

        # Last studied timestamp
        last_activity_stmt = select(func.max(StudyActivity.created_at)).where(
            StudyActivity.clerk_user_id == clerk_user_id,
            StudyActivity.document_id == document_id,
        )
        last_studied_at = self._session.execute(last_activity_stmt).scalar()

        return {
            "document_id": document_id,
            "total_flashcards": total_flashcards,
            "reviewed_flashcards": reviewed_flashcards,
            "mastered_flashcards": mastered_flashcards,
            "learning_flashcards": learning_flashcards,
            "bookmarked_questions_count": bookmarked_count,
            "quiz_attempts_count": quiz_attempts_count,
            "latest_quiz_score": latest_quiz_score,
            "best_quiz_score": best_quiz_score,
            "last_studied_at": last_studied_at,
        }
