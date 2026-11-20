"""Service layer for Phase 8 study progress, flashcard mastery, bookmarks, quiz history, and search."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.study_progress import (
    FlashcardProgress,
    QuestionBookmark,
    QuizAttempt,
)
from app.models.study_resource import ResourceType, StudyResource
from app.repositories.document_repository import DocumentRepository
from app.repositories.study_progress_repository import StudyProgressRepository
from app.repositories.study_resource_repository import StudyResourceRepository
from app.schemas.study_progress import (
    DocumentSearchResponse,
    FlashcardProgressListResponse,
    FlashcardProgressResponse,
    QuestionBookmarkResponse,
    QuizAttemptDetailResponse,
    QuizAttemptSummaryResponse,
    SearchResultItem,
    StudyProgressOverviewResponse,
)
from app.services.ai_generation_service import (
    DocumentNotFoundError,
    ResourceNotFoundError,
)

logger = logging.getLogger(__name__)


def _make_snippet(text: str, query: str, window: int = 60) -> str:
    """Generate a clean excerpt showing the matching query term in context."""
    lower_text = text.lower()
    lower_query = query.lower()
    idx = lower_text.find(lower_query)
    if idx == -1:
        return text[:window * 2].strip() + ("..." if len(text) > window * 2 else "")

    start = max(0, idx - window)
    end = min(len(text), idx + len(query) + window)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(text) else ""
    return f"{prefix}{text[start:end].strip()}{suffix}"


class StudyProgressService:
    """Orchestrates persistent learning interactions, quiz history, and search across study materials."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._doc_repo = DocumentRepository(session)
        self._resource_repo = StudyResourceRepository(session)
        self._progress_repo = StudyProgressRepository(session)

    # -------------------------------------------------------------------------
    # Flashcard Progress
    # -------------------------------------------------------------------------

    def get_flashcard_progress(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID | None = None,
    ) -> FlashcardProgressListResponse:
        """Retrieve progress and mastery counts for active or requested flashcard resource."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        if resource_id is not None:
            resource = self._resource_repo.get_by_id(resource_id)
            if not resource or resource.document_id != document_id:
                raise ResourceNotFoundError(f"Flashcard resource {resource_id} not found")
        else:
            resource = self._resource_repo.get_active_by_type(document_id, ResourceType.FLASHCARDS)

        if not resource or not resource.content:
            return FlashcardProgressListResponse(
                document_id=document_id,
                resource_id=resource.id if resource else None,
                total_cards=0,
                reviewed_cards=0,
                mastered_cards=0,
                learning_cards=0,
                items=[],
            )

        cards = resource.content.get("cards", [])
        total_cards = len(cards)
        progress_items = self._progress_repo.list_flashcard_progress_for_resource(
            clerk_user_id=clerk_user_id,
            resource_id=resource.id,
        )

        reviewed_cards = sum(1 for p in progress_items if p.review_count > 0)
        mastered_cards = sum(1 for p in progress_items if p.mastery_level == 3)
        learning_cards = sum(1 for p in progress_items if p.mastery_level in (1, 2))

        return FlashcardProgressListResponse(
            document_id=document_id,
            resource_id=resource.id,
            total_cards=total_cards,
            reviewed_cards=reviewed_cards,
            mastered_cards=mastered_cards,
            learning_cards=learning_cards,
            items=[FlashcardProgressResponse.model_validate(p) for p in progress_items],
        )

    def update_flashcard_progress(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        card_id: str,
        result: str,
    ) -> FlashcardProgressResponse:
        """Update flashcard mastery status for an authenticated student."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        resource = self._resource_repo.get_by_id(resource_id)
        if not resource or resource.document_id != document_id or resource.resource_type != ResourceType.FLASHCARDS:
            raise ResourceNotFoundError(f"Flashcard resource {resource_id} not found")

        # Verify card_id exists in content
        content = resource.content or {}
        cards = content.get("cards", [])
        card_exists = any(str(c.get("id")) == card_id for c in cards)
        if not card_exists:
            raise ValueError(f"Flashcard with id '{card_id}' not found in resource {resource_id}")

        progress = self._progress_repo.update_flashcard_mastery(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource_id,
            card_id=card_id,
            result=result,
        )
        self._session.commit()
        return FlashcardProgressResponse.model_validate(progress)

    # -------------------------------------------------------------------------
    # Question Bookmarks
    # -------------------------------------------------------------------------

    def list_bookmarks(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID | None = None,
    ) -> list[QuestionBookmarkResponse]:
        """List saved question bookmarks for an authenticated student's document."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        bookmarks = self._progress_repo.list_bookmarks_by_document(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource_id,
        )
        return [QuestionBookmarkResponse.model_validate(b) for b in bookmarks]

    def add_bookmark(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        question_id: str,
    ) -> QuestionBookmarkResponse:
        """Bookmark an important question for later revision."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        resource = self._resource_repo.get_by_id(resource_id)
        if not resource or resource.document_id != document_id or resource.resource_type != ResourceType.QUESTIONS:
            raise ResourceNotFoundError(f"Question resource {resource_id} not found")

        content = resource.content or {}
        questions = content.get("questions", [])
        question_exists = any(str(q.get("id")) == question_id for q in questions)
        if not question_exists:
            raise ValueError(f"Question with id '{question_id}' not found in resource {resource_id}")

        bookmark = self._progress_repo.add_bookmark(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource_id,
            question_id=question_id,
        )
        self._session.commit()
        return QuestionBookmarkResponse.model_validate(bookmark)

    def remove_bookmark(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        bookmark_id: uuid.UUID,
    ) -> bool:
        """Remove a bookmark with ownership validation."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        bookmark = self._progress_repo.get_bookmark_by_id(clerk_user_id, bookmark_id)
        if not bookmark or bookmark.document_id != document_id:
            raise ResourceNotFoundError(f"Bookmark {bookmark_id} not found")

        removed = self._progress_repo.remove_bookmark(clerk_user_id, bookmark_id)
        self._session.commit()
        return removed

    # -------------------------------------------------------------------------
    # Quiz History
    # -------------------------------------------------------------------------

    def list_quiz_attempts(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID | None = None,
    ) -> list[QuizAttemptSummaryResponse]:
        """List historical quiz attempts for this document."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        attempts = self._progress_repo.list_quiz_attempts(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource_id,
        )
        return [QuizAttemptSummaryResponse.model_validate(att) for att in attempts]

    def get_quiz_attempt(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> QuizAttemptDetailResponse:
        """Retrieve full details of a specific quiz attempt."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        attempt = self._progress_repo.get_quiz_attempt(clerk_user_id, attempt_id)
        if not attempt or attempt.document_id != document_id:
            raise ResourceNotFoundError(f"Quiz attempt {attempt_id} not found")

        return QuizAttemptDetailResponse.model_validate(attempt)

    # -------------------------------------------------------------------------
    # Study Progress Overview
    # -------------------------------------------------------------------------

    def get_progress_overview(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> StudyProgressOverviewResponse:
        """Aggregate all persistent metrics for the document workspace."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        active_flashcards = self._resource_repo.get_active_by_type(
            document_id, ResourceType.FLASHCARDS
        )
        active_questions = self._resource_repo.get_active_by_type(
            document_id, ResourceType.QUESTIONS
        )

        overview = self._progress_repo.get_study_progress_overview(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            active_flashcards=active_flashcards,
            active_questions=active_questions,
        )
        return StudyProgressOverviewResponse(**overview)

    # -------------------------------------------------------------------------
    # Search Across Active Study Materials
    # -------------------------------------------------------------------------

    def search_study_resources(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        query: str,
    ) -> DocumentSearchResponse:
        """Search across generated notes, summary, questions, flashcards, and quiz prompts."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        normalized = query.strip()
        if not normalized:
            return DocumentSearchResponse(
                document_id=document_id,
                query=query,
                total_results=0,
                results=[],
            )

        q_lower = normalized.lower()
        active_resources = self._resource_repo.list_active_by_document(document_id)
        matches: list[SearchResultItem] = []

        for res in active_resources:
            content = res.content or {}
            r_type = res.resource_type

            if r_type == ResourceType.NOTES:
                sections = content.get("sections", [])
                for idx, sec in enumerate(sections):
                    heading = sec.get("heading", "")
                    body = sec.get("content", "")
                    pages = sec.get("source_pages", [])

                    if q_lower in heading.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="notes",
                                title=heading,
                                snippet=_make_snippet(heading, normalized),
                                match_field="heading",
                                target_id=f"section-{idx}",
                                source_pages=pages,
                            )
                        )
                    if q_lower in body.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="notes",
                                title=heading,
                                snippet=_make_snippet(body, normalized),
                                match_field="content",
                                target_id=f"section-{idx}",
                                source_pages=pages,
                            )
                        )
                    for pt in sec.get("key_points", []):
                        if q_lower in pt.lower():
                            matches.append(
                                SearchResultItem(
                                    resource_type="notes",
                                    title=f"{heading} · Key Point",
                                    snippet=_make_snippet(pt, normalized),
                                    match_field="key_point",
                                    target_id=f"section-{idx}",
                                    source_pages=pages,
                                )
                            )

                for term in content.get("key_terms", []):
                    t_name = term.get("term", "")
                    t_def = term.get("definition", "")
                    pages = term.get("source_pages", [])
                    if q_lower in t_name.lower() or q_lower in t_def.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="notes",
                                title=f"Term: {t_name}",
                                snippet=_make_snippet(f"{t_name}: {t_def}", normalized),
                                match_field="term",
                                target_id=f"term-{t_name}",
                                source_pages=pages,
                            )
                        )

            elif r_type == ResourceType.SUMMARY:
                for t in content.get("main_topics", []):
                    topic = t.get("topic", "")
                    summary = t.get("summary", "")
                    pages = t.get("source_pages", [])
                    if q_lower in topic.lower() or q_lower in summary.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="summary",
                                title=f"Summary Topic: {topic}",
                                snippet=_make_snippet(summary, normalized),
                                match_field="summary_topic",
                                target_id=f"topic-{topic}",
                                source_pages=pages,
                            )
                        )
                for takeaway in content.get("key_takeaways", []):
                    if q_lower in takeaway.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="summary",
                                title="Core Learning Takeaway",
                                snippet=_make_snippet(takeaway, normalized),
                                match_field="key_takeaway",
                                target_id="takeaways",
                                source_pages=[],
                            )
                        )

            elif r_type == ResourceType.QUESTIONS:
                questions = content.get("questions", [])
                for q in questions:
                    q_id = str(q.get("id"))
                    q_text = q.get("question", "")
                    q_ans = q.get("answer", "")
                    pages = q.get("source_pages", [])

                    if q_lower in q_text.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="questions",
                                title=f"Question: {q_text[:70]}",
                                snippet=_make_snippet(q_text, normalized),
                                match_field="question",
                                target_id=q_id,
                                source_pages=pages,
                            )
                        )
                    if q_lower in q_ans.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="questions",
                                title=f"Answer to: {q_text[:60]}",
                                snippet=_make_snippet(q_ans, normalized),
                                match_field="answer",
                                target_id=q_id,
                                source_pages=pages,
                            )
                        )

            elif r_type == ResourceType.FLASHCARDS:
                cards = content.get("cards", [])
                for card in cards:
                    c_id = str(card.get("id"))
                    front = card.get("front", "")
                    back = card.get("back", "")
                    pages = card.get("source_pages", [])

                    if q_lower in front.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="flashcards",
                                title=f"Flashcard Front: {front[:60]}",
                                snippet=_make_snippet(front, normalized),
                                match_field="card_front",
                                target_id=c_id,
                                source_pages=pages,
                            )
                        )
                    if q_lower in back.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="flashcards",
                                title=f"Flashcard Back: {front[:60]}",
                                snippet=_make_snippet(back, normalized),
                                match_field="card_back",
                                target_id=c_id,
                                source_pages=pages,
                            )
                        )

            elif r_type == ResourceType.QUIZ:
                # Security guarantee: NEVER expose answer keys or explanations here!
                for q in content.get("questions", []):
                    q_id = str(q.get("id"))
                    q_text = q.get("question", "")
                    pages = q.get("source_pages", [])
                    if q_lower in q_text.lower():
                        matches.append(
                            SearchResultItem(
                                resource_type="quiz",
                                title=f"Quiz Question: {q_text[:70]}",
                                snippet=_make_snippet(q_text, normalized),
                                match_field="quiz_question",
                                target_id=q_id,
                                source_pages=pages,
                            )
                        )

        return DocumentSearchResponse(
            document_id=document_id,
            query=query,
            total_results=len(matches),
            results=matches,
        )

