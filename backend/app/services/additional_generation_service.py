"""Service for Phase 11 on-demand custom practice generation, difficulty control, and batch persistence."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Type

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.ai.base import (
    AICompletionResult,
    AIProviderError,
    AIValidationError,
    BaseAIProvider,
)
from app.ai.prompts import (
    build_flashcards_prompt,
    build_questions_prompt,
    build_quiz_prompt,
)
from app.ai.schemas import (
    FlashcardItem,
    FlashcardsContent,
    QuestionGradeResult,
    QuestionItem,
    QuestionsContent,
    QuizContent,
    QuizQuestionItem,
    QuizSubmissionResponse,
    sanitize_quiz_content_for_client,
)
from app.core.config import Settings, get_settings
from app.models.document import Document
from app.models.document_extraction import ExtractionStatus
from app.models.study_generation_batch import BatchStatus, StudyGenerationBatch
from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)
from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.repositories.study_generation_batch_repository import (
    StudyGenerationBatchRepository,
)
from app.repositories.study_progress_repository import StudyProgressRepository
from app.repositories.study_resource_repository import StudyResourceRepository
from app.schemas.additional_generation import (
    AggregatedFlashcardItem,
    AggregatedFlashcardsResponse,
    AggregatedQuestionItem,
    AggregatedQuestionsResponse,
    AggregatedQuizQuestionItem,
    AggregatedQuizResponse,
    AvailableTopicsResponse,
    QuizPracticeSetSummary,
    StudyGenerationBatchResponse,
)
from app.services.ai_generation_service import (
    AIGenerationService,
    DocumentNotFoundError,
    GenerationInProgressError,
    ResourceNotFoundError,
)
from app.services.document_context_service import (
    DocumentContext,
    DocumentContextService,
    ExtractionNotCompletedError,
)

logger = logging.getLogger(__name__)

STOP_WORDS = {
    "what", "is", "the", "a", "an", "of", "and", "in", "to", "for", "with",
    "on", "at", "by", "from", "define", "explain", "describe", "discuss",
    "how", "why", "which", "are", "do", "does", "did", "can", "could", "would",
}


def normalize_text_for_dedup(text: str) -> str:
    """Normalize text for duplicate checking: lowercase, strip punctuation, collapse whitespace."""
    lower = text.lower()
    cleaned = re.sub(r"[^\w\s]", "", lower)
    return " ".join(cleaned.split())


def calculate_token_similarity(text1: str, text2: str) -> float:
    """Calculate Jaccard similarity of non-stop-word tokens between two texts."""
    t1 = set(normalize_text_for_dedup(text1).split()) - STOP_WORDS
    t2 = set(normalize_text_for_dedup(text2).split()) - STOP_WORDS
    if not t1 or not t2:
        return 0.0
    return len(t1 & t2) / len(t1 | t2)


def is_duplicate_item(new_text: str, existing_texts: list[str], threshold: float = 0.82) -> bool:
    """Determine whether new_text duplicates any existing item text."""
    norm_new = normalize_text_for_dedup(new_text)
    if not norm_new:
        return True
    for existing in existing_texts:
        norm_existing = normalize_text_for_dedup(existing)
        if norm_new == norm_existing:
            return True
        if calculate_token_similarity(norm_new, norm_existing) >= threshold:
            return True
    return False


class AdditionalGenerationService:
    """Service orchestrating Phase 11 on-demand generation batches, difficulty control, and deduplication."""

    def __init__(
        self,
        session: Session,
        provider: BaseAIProvider,
        settings: Settings | None = None,
    ) -> None:
        self._session = session
        self._provider = provider
        self._settings = settings or get_settings()
        self._doc_repo = DocumentRepository(session)
        self._extraction_repo = ExtractionRepository(session)
        self._batch_repo = StudyGenerationBatchRepository(session)
        self._resource_repo = StudyResourceRepository(session)
        self._progress_repo = StudyProgressRepository(session)
        self._context_service = DocumentContextService(
            session,
            default_max_context_tokens=self._settings.ai_max_context_tokens,
        )

    # -------------------------------------------------------------------------
    # Batch Initialization & Lifecycle
    # -------------------------------------------------------------------------

    def create_generation_batch(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_type: str,
        difficulty: str = "random",
        count: int = 10,
        topic: str | None = None,
    ) -> StudyGenerationBatch:
        """Validate ownership and parameters, then record a pending StudyGenerationBatch."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        extraction = self._extraction_repo.get_by_document_id(document_id)
        if not extraction or extraction.status != ExtractionStatus.COMPLETED:
            raise ExtractionNotCompletedError(
                "Text extraction must be completed before additional practice can be generated."
            )

        if resource_type not in (
            ResourceType.QUESTIONS.value,
            ResourceType.FLASHCARDS.value,
            ResourceType.QUIZ.value,
        ):
            raise ValueError(f"Unsupported resource type for additional generation: {resource_type}")

        if difficulty not in ("easy", "medium", "hard", "random"):
            raise ValueError(f"Invalid difficulty '{difficulty}'. Must be one of: easy, medium, hard, random")

        max_allowed = self._settings.ai_additional_generation_max_items
        if count < 1 or count > max_allowed:
            raise ValueError(f"Requested count must be between 1 and {max_allowed}, got {count}")

        # Check for active pending/generating batch for same document and resource_type
        existing_batches = self._batch_repo.list_by_document(document_id, resource_type=resource_type)
        running = [b for b in existing_batches if b.status in (BatchStatus.PENDING.value, BatchStatus.GENERATING.value)]
        if running:
            raise GenerationInProgressError(
                f"A generation batch for '{resource_type}' is already running for this document."
            )

        clean_topic = topic.strip() if topic and topic.strip() else None

        batch = self._batch_repo.create(
            document_id=document_id,
            resource_type=resource_type,
            difficulty=difficulty,
            requested_count=count,
            topic=clean_topic,
            model_name=self._settings.kilo_model,
            prompt_version="v1",
            status=BatchStatus.PENDING.value,
        )
        self._session.commit()
        return batch

    def process_generation_batch(self, batch_id: uuid.UUID) -> StudyResource:
        """Execute AI generation for a pending batch, deduplicate, and persist new StudyResource."""
        batch = self._batch_repo.get_by_id(batch_id)
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")

        doc = self._doc_repo.get_by_id_unscoped(batch.document_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {batch.document_id} not found")

        self._batch_repo.mark_generating(batch_id)
        self._session.commit()

        try:
            # 1. Prepare grounded context
            context = self._context_service.prepare_context(batch.document_id)

            # 2. Collect existing items for prompt-level avoidance and programmatic deduplication
            existing_texts = self._collect_existing_item_texts(batch.document_id, ResourceType(batch.resource_type))

            # 3. Build prompt with difficulty control, topic, and existing items
            r_type = ResourceType(batch.resource_type)
            messages, schema_cls = self._build_prompt_and_schema(
                resource_type=r_type,
                doc_title=doc.original_filename,
                context=context,
                count=batch.requested_count,
                difficulty=batch.difficulty,
                topic=batch.topic,
                existing_items=existing_texts,
            )

            # 4. Invoke AI Provider
            completion = self._provider.generate(
                messages=messages,
                model=self._settings.kilo_model,
                temperature=self._settings.ai_temperature,
                max_tokens=self._settings.ai_max_output_tokens,
                response_format={"type": "json_object"},
                timeout=float(self._settings.ai_request_timeout_seconds),
            )

            # 5. Parse, validate, repair, clamp pages
            raw_content = AIGenerationService(self._session, self._provider, self._settings)._parse_and_validate(
                raw_text=completion.content,
                schema_cls=schema_cls,
                context=context,
            )

            # 6. Programmatic Deduplication & ID Stabilization
            validated_content, unique_count = self._deduplicate_and_stabilize(
                resource_type=r_type,
                content=raw_content,
                existing_texts=existing_texts,
                requested_difficulty=batch.difficulty,
                batch_id=batch.id,
            )

            if unique_count == 0:
                raise AIValidationError("Generated items were duplicates of existing content. No unique items created.")

            # 7. Persist new immutable StudyResource linked to this batch
            next_version = self._resource_repo.get_latest_version(batch.document_id, r_type) + 1
            new_resource = self._resource_repo.create(
                document_id=batch.document_id,
                resource_type=r_type,
                model_name=self._settings.kilo_model,
                prompt_version="v1",
                status=ResourceStatus.COMPLETED,
                content=validated_content,
                version=next_version,
                is_active=True,
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
                generation_batch_id=batch.id,
                difficulty=batch.difficulty,
                topic=batch.topic,
            )

            # 8. Mark batch completed
            self._batch_repo.mark_completed(
                batch_id=batch.id,
                resource_id=new_resource.id,
                generated_count=unique_count,
            )
            self._session.commit()

            logger.info(
                "Completed generation batch %s: saved %d unique items for %s",
                batch.id,
                unique_count,
                batch.resource_type,
            )
            return new_resource

        except Exception as exc:
            logger.exception("Failed generation batch %s: %s", batch_id, exc)
            self._batch_repo.mark_failed(batch_id, error_message=str(exc))
            self._session.commit()
            raise

    # -------------------------------------------------------------------------
    # Retrieval & Aggregation
    # -------------------------------------------------------------------------

    def get_generation_batch(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        batch_id: uuid.UUID,
    ) -> StudyGenerationBatchResponse:
        """Retrieve a specific batch by ID with ownership verification."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        batch = self._batch_repo.get_by_id_and_doc(batch_id, document_id)
        if not batch:
            raise ResourceNotFoundError(f"Generation batch {batch_id} not found")

        return StudyGenerationBatchResponse.model_validate(batch)

    def list_generation_batches(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_type: str | None = None,
    ) -> list[StudyGenerationBatchResponse]:
        """List all generation batches for a document."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        batches = self._batch_repo.list_by_document(document_id, resource_type=resource_type)
        return [StudyGenerationBatchResponse.model_validate(b) for b in batches]

    def get_available_topics(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> AvailableTopicsResponse:
        """Discover available section and summary topics from active study resources."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        topics: set[str] = set()

        # 1. Notes sections headings
        notes_res = self._resource_repo.get_active_by_type(document_id, ResourceType.NOTES)
        if notes_res and notes_res.content:
            for sec in notes_res.content.get("sections", []):
                heading = sec.get("heading")
                if heading and len(heading.strip()) > 2:
                    topics.add(heading.strip())

        # 2. Summary main_topics
        summary_res = self._resource_repo.get_active_by_type(document_id, ResourceType.SUMMARY)
        if summary_res and summary_res.content:
            for t_item in summary_res.content.get("main_topics", []):
                t_name = t_item.get("topic")
                if t_name and len(t_name.strip()) > 2:
                    topics.add(t_name.strip())

        sorted_topics = sorted(topics)
        return AvailableTopicsResponse(
            document_id=document_id,
            topics=sorted_topics,
        )

    def get_aggregated_questions(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> AggregatedQuestionsResponse:
        """Combine base questions and all active batches into one unified collection."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        base_res = self._resource_repo.get_active_by_type(document_id, ResourceType.QUESTIONS)
        batch_resources = self._resource_repo.list_active_batches_by_type(document_id, ResourceType.QUESTIONS)
        batches = self._batch_repo.list_by_document(document_id, resource_type=ResourceType.QUESTIONS.value)

        batch_meta_map: dict[uuid.UUID, StudyGenerationBatch] = {b.id: b for b in batches}

        aggregated_questions: list[AggregatedQuestionItem] = []

        # 1. Base questions
        if base_res and base_res.content:
            raw_qs = base_res.content.get("questions", [])
            for q in raw_qs:
                aggregated_questions.append(
                    AggregatedQuestionItem(
                        id=q["id"],
                        question=q["question"],
                        answer=q["answer"],
                        answer_type=q.get("answer_type", "short"),
                        difficulty=q.get("difficulty", "medium"),
                        source_pages=q.get("source_pages", []),
                        important_points=q.get("important_points", []),
                        resource_id=base_res.id,
                        batch_id=None,
                        batch_label="Original",
                    )
                )

        # 2. Batch questions
        for idx, b_res in enumerate(batch_resources, start=1):
            if not b_res.content:
                continue
            b_model = batch_meta_map.get(b_res.generation_batch_id) if b_res.generation_batch_id else None
            b_diff = (b_model.difficulty.capitalize()) if b_model else (b_res.difficulty.capitalize() if b_res.difficulty else "Custom")
            label = f"Batch {idx} ({b_diff})"
            for q in b_res.content.get("questions", []):
                aggregated_questions.append(
                    AggregatedQuestionItem(
                        id=q["id"],
                        question=q["question"],
                        answer=q["answer"],
                        answer_type=q.get("answer_type", "short"),
                        difficulty=q.get("difficulty", "medium"),
                        source_pages=q.get("source_pages", []),
                        important_points=q.get("important_points", []),
                        resource_id=b_res.id,
                        batch_id=b_res.generation_batch_id,
                        batch_label=label,
                    )
                )

        return AggregatedQuestionsResponse(
            document_id=document_id,
            total_questions=len(aggregated_questions),
            questions=aggregated_questions,
            batches=[StudyGenerationBatchResponse.model_validate(b) for b in batches],
        )

    def get_aggregated_flashcards(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> AggregatedFlashcardsResponse:
        """Combine base flashcards and all active batches into one unified collection."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        base_res = self._resource_repo.get_active_by_type(document_id, ResourceType.FLASHCARDS)
        batch_resources = self._resource_repo.list_active_batches_by_type(document_id, ResourceType.FLASHCARDS)
        batches = self._batch_repo.list_by_document(document_id, resource_type=ResourceType.FLASHCARDS.value)

        batch_meta_map: dict[uuid.UUID, StudyGenerationBatch] = {b.id: b for b in batches}

        aggregated_cards: list[AggregatedFlashcardItem] = []

        # 1. Base cards
        if base_res and base_res.content:
            for c in base_res.content.get("cards", []):
                aggregated_cards.append(
                    AggregatedFlashcardItem(
                        id=c["id"],
                        front=c["front"],
                        back=c["back"],
                        difficulty=c.get("difficulty", "medium"),
                        source_pages=c.get("source_pages", []),
                        resource_id=base_res.id,
                        batch_id=None,
                        batch_label="Original",
                    )
                )

        # 2. Batch cards
        for idx, b_res in enumerate(batch_resources, start=1):
            if not b_res.content:
                continue
            b_model = batch_meta_map.get(b_res.generation_batch_id) if b_res.generation_batch_id else None
            b_diff = (b_model.difficulty.capitalize()) if b_model else (b_res.difficulty.capitalize() if b_res.difficulty else "Custom")
            label = f"Batch {idx} ({b_diff})"
            for c in b_res.content.get("cards", []):
                aggregated_cards.append(
                    AggregatedFlashcardItem(
                        id=c["id"],
                        front=c["front"],
                        back=c["back"],
                        difficulty=c.get("difficulty", "medium"),
                        source_pages=c.get("source_pages", []),
                        resource_id=b_res.id,
                        batch_id=b_res.generation_batch_id,
                        batch_label=label,
                    )
                )

        return AggregatedFlashcardsResponse(
            document_id=document_id,
            total_cards=len(aggregated_cards),
            cards=aggregated_cards,
            batches=[StudyGenerationBatchResponse.model_validate(b) for b in batches],
        )

    def get_aggregated_quiz(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> AggregatedQuizResponse:
        """Return practice sets and sanitized questions for the quiz workspace."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        base_res = self._resource_repo.get_active_by_type(document_id, ResourceType.QUIZ)
        batch_resources = self._resource_repo.list_active_batches_by_type(document_id, ResourceType.QUIZ)
        batches = self._batch_repo.list_by_document(document_id, resource_type=ResourceType.QUIZ.value)

        batch_meta_map: dict[uuid.UUID, StudyGenerationBatch] = {b.id: b for b in batches}

        practice_sets: list[QuizPracticeSetSummary] = []
        all_questions: list[AggregatedQuizQuestionItem] = []

        total_combined_count = 0

        # Base quiz set
        if base_res and base_res.content:
            raw_qs = base_res.content.get("questions", [])
            q_count = len(raw_qs)
            total_combined_count += q_count
            practice_sets.append(
                QuizPracticeSetSummary(
                    set_id=str(base_res.id),
                    title=f"Original Quiz ({q_count} Questions)",
                    question_count=q_count,
                    difficulty="mixed",
                    topic=None,
                    resource_id=base_res.id,
                    batch_id=None,
                    created_at=base_res.created_at,
                )
            )
            for q in raw_qs:
                all_questions.append(
                    AggregatedQuizQuestionItem(
                        id=q["id"],
                        question=q["question"],
                        options=q.get("options", []),
                        difficulty=q.get("difficulty", "medium"),
                        source_pages=q.get("source_pages", []),
                        resource_id=base_res.id,
                        batch_id=None,
                        batch_label="Original",
                    )
                )

        # Batch quiz sets
        for idx, b_res in enumerate(batch_resources, start=1):
            if not b_res.content:
                continue
            raw_qs = b_res.content.get("questions", [])
            q_count = len(raw_qs)
            total_combined_count += q_count
            b_model = batch_meta_map.get(b_res.generation_batch_id) if b_res.generation_batch_id else None
            diff_label = (b_model.difficulty.capitalize()) if b_model else (b_res.difficulty.capitalize() if b_res.difficulty else "Custom")
            topic_str = f" - {b_res.topic}" if b_res.topic else ""
            title = f"Set {idx}: {diff_label}{topic_str} ({q_count} Questions)"
            practice_sets.append(
                QuizPracticeSetSummary(
                    set_id=str(b_res.id),
                    title=title,
                    question_count=q_count,
                    difficulty=b_res.difficulty or "random",
                    topic=b_res.topic,
                    resource_id=b_res.id,
                    batch_id=b_res.generation_batch_id,
                    created_at=b_res.created_at,
                )
            )
            for q in raw_qs:
                all_questions.append(
                    AggregatedQuizQuestionItem(
                        id=q["id"],
                        question=q["question"],
                        options=q.get("options", []),
                        difficulty=q.get("difficulty", "medium"),
                        source_pages=q.get("source_pages", []),
                        resource_id=b_res.id,
                        batch_id=b_res.generation_batch_id,
                        batch_label=f"Set {idx} ({diff_label})",
                    )
                )

        # Prepend 'All Questions' set if more than 1 distinct set exists
        if len(practice_sets) > 1:
            all_set = QuizPracticeSetSummary(
                set_id="all",
                title=f"All Questions ({total_combined_count} Questions)",
                question_count=total_combined_count,
                difficulty="mixed",
                topic=None,
                resource_id=base_res.id if base_res else None,
                batch_id=None,
                created_at=None,
            )
            practice_sets.insert(0, all_set)

        return AggregatedQuizResponse(
            document_id=document_id,
            practice_sets=practice_sets,
            questions=all_questions,
            batches=[StudyGenerationBatchResponse.model_validate(b) for b in batches],
        )

    # -------------------------------------------------------------------------
    # Server-Side Practice Set Quiz Grading
    # -------------------------------------------------------------------------

    def grade_practice_set_quiz(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        practice_set_id: str,
        user_answers: dict[str, int],
    ) -> QuizSubmissionResponse:
        """Evaluate submitted answers for an entire practice set or 'all' questions."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        # Gather relevant resources
        if practice_set_id == "all":
            all_quiz_resources = self._resource_repo.list_all_active_by_type(document_id, ResourceType.QUIZ)
            if not all_quiz_resources:
                raise ValueError("No quiz questions found to evaluate")
            # Build master question list from all resources
            master_questions: list[dict[str, Any]] = []
            for r in all_quiz_resources:
                if r.content and "questions" in r.content:
                    master_questions.extend(r.content["questions"])
            anchor_resource_id = all_quiz_resources[0].id
        else:
            try:
                target_uuid = uuid.UUID(practice_set_id)
            except ValueError:
                raise ValueError(f"Invalid practice_set_id: {practice_set_id}") from None

            resource = self._resource_repo.get_by_id(target_uuid)
            if not resource or resource.document_id != document_id or resource.resource_type != ResourceType.QUIZ:
                raise ResourceNotFoundError(f"Quiz resource {practice_set_id} not found")
            master_questions = (resource.content or {}).get("questions", [])
            anchor_resource_id = resource.id

        if not master_questions:
            raise ValueError("Quiz has no questions to evaluate")

        results: list[QuestionGradeResult] = []
        correct_count = 0
        total_questions = len(master_questions)

        for q in master_questions:
            q_id = str(q.get("id"))
            correct_idx = int(q.get("correct_option_index", 0))
            selected_idx = user_answers.get(q_id)

            is_correct = selected_idx is not None and int(selected_idx) == correct_idx
            if is_correct:
                correct_count += 1

            results.append(
                QuestionGradeResult(
                    question_id=q_id,
                    question=q.get("question", ""),
                    options=q.get("options", []),
                    selected_option_index=selected_idx,
                    correct_option_index=correct_idx,
                    is_correct=is_correct,
                    explanation=q.get("explanation", ""),
                    source_pages=q.get("source_pages", []),
                )
            )

        answered_count = sum(1 for q in master_questions if str(q.get("id")) in user_answers)
        score_pct = round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0.0

        attempt = self._progress_repo.create_quiz_attempt(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=anchor_resource_id,
            total_questions=total_questions,
            correct_answers=correct_count,
            score_percentage=score_pct,
            submitted_answers=user_answers,
            graded_result=[r.model_dump() for r in results],
        )

        return QuizSubmissionResponse(
            resource_id=anchor_resource_id,
            total_questions=total_questions,
            answered_questions=answered_count,
            correct_answers=correct_count,
            score_percentage=score_pct,
            results=results,
            attempt_id=attempt.id,
            completed_at=attempt.completed_at,
        )

    # -------------------------------------------------------------------------
    # Internal Helpers
    # -------------------------------------------------------------------------

    def _collect_existing_item_texts(
        self, document_id: uuid.UUID, resource_type: ResourceType
    ) -> list[str]:
        """Collect existing questions/prompts across base resource and completed batches for duplicate avoidance."""
        existing: list[str] = []
        all_resources = self._resource_repo.list_all_active_by_type(document_id, resource_type)

        for r in all_resources:
            content = r.content or {}
            if resource_type in (ResourceType.QUESTIONS, ResourceType.QUIZ):
                for q in content.get("questions", []):
                    if "question" in q and q["question"]:
                        existing.append(q["question"].strip())
            elif resource_type == ResourceType.FLASHCARDS:
                for c in content.get("cards", []):
                    if "front" in c and c["front"]:
                        existing.append(c["front"].strip())

        return existing

    def _build_prompt_and_schema(
        self,
        resource_type: ResourceType,
        doc_title: str,
        context: DocumentContext,
        count: int,
        difficulty: str,
        topic: str | None,
        existing_items: list[str],
    ) -> tuple[list[dict[str, str]], Type[BaseModel]]:
        text = context.formatted_text
        if resource_type == ResourceType.QUESTIONS:
            return (
                build_questions_prompt(
                    document_title=doc_title,
                    formatted_context=text,
                    count=count,
                    difficulty=difficulty,
                    topic=topic,
                    existing_items=existing_items,
                ),
                QuestionsContent,
            )
        elif resource_type == ResourceType.FLASHCARDS:
            return (
                build_flashcards_prompt(
                    document_title=doc_title,
                    formatted_context=text,
                    count=count,
                    difficulty=difficulty,
                    topic=topic,
                    existing_items=existing_items,
                ),
                FlashcardsContent,
            )
        elif resource_type == ResourceType.QUIZ:
            return (
                build_quiz_prompt(
                    document_title=doc_title,
                    formatted_context=text,
                    count=count,
                    difficulty=difficulty,
                    topic=topic,
                    existing_items=existing_items,
                ),
                QuizContent,
            )
        else:
            raise ValueError(f"Unsupported resource type for custom generation: {resource_type}")

    def _deduplicate_and_stabilize(
        self,
        resource_type: ResourceType,
        content: dict[str, Any],
        existing_texts: list[str],
        requested_difficulty: str,
        batch_id: uuid.UUID,
    ) -> tuple[dict[str, Any], int]:
        """Filter out duplicates, enforce valid difficulties, and assign stable UUID-based item IDs."""
        seen_texts = list(existing_texts)

        if resource_type in (ResourceType.QUESTIONS, ResourceType.QUIZ):
            items_key = "questions"
            text_key = "question"
            prefix = "q" if resource_type == ResourceType.QUESTIONS else "mcq"
        else:
            items_key = "cards"
            text_key = "front"
            prefix = "fc"

        raw_items = content.get(items_key, [])
        unique_items: list[dict[str, Any]] = []

        for idx, item in enumerate(raw_items):
            item_text = str(item.get(text_key, "")).strip()
            if not item_text:
                continue

            # Check duplicate against existing + previously kept in this batch
            if is_duplicate_item(item_text, seen_texts):
                logger.info("Dropping duplicate item: %s", item_text[:80])
                continue

            seen_texts.append(item_text)

            # Assign globally unique stable item ID
            item["id"] = f"{prefix}_{batch_id.hex[:6]}_{uuid.uuid4().hex[:6]}"

            # Enforce difficulty label rules
            if requested_difficulty in ("easy", "medium", "hard"):
                item["difficulty"] = requested_difficulty
            elif item.get("difficulty") not in ("easy", "medium", "hard"):
                item["difficulty"] = "medium"

            unique_items.append(item)

        content[items_key] = unique_items
        return content, len(unique_items)

