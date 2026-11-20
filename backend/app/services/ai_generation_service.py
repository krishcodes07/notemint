"""Central AI generation service for NoteMint study resources."""

from __future__ import annotations

import json
import logging
import re
import uuid
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
    build_notes_prompt,
    build_quiz_prompt,
    build_questions_prompt,
    build_summary_prompt,
)
from app.ai.schemas import (
    FlashcardsContent,
    NotesContent,
    QuestionGradeResult,
    QuestionsContent,
    QuizContent,
    QuizSubmissionResponse,
    SummaryContent,
    sanitize_quiz_content_for_client,
)
from app.core.config import Settings, get_settings
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import ExtractionStatus
from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)
from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.repositories.study_progress_repository import StudyProgressRepository
from app.repositories.study_resource_repository import StudyResourceRepository
from app.services.document_context_service import (
    DocumentContext,
    DocumentContextService,
    ExtractionNotCompletedError,
)

logger = logging.getLogger(__name__)


class DocumentAccessDeniedError(Exception):
    """User is not authorized to access or modify this document."""


class DocumentNotFoundError(Exception):
    """Target document was not found."""


class ResourceNotFoundError(Exception):
    """Target study resource was not found."""


class GenerationInProgressError(Exception):
    """A generation job for this resource type is already running."""


class AIGenerationService:
    """Service orchestrating AI study resource synthesis, validation, persistence, and grading."""

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
        self._resource_repo = StudyResourceRepository(session)
        self._progress_repo = StudyProgressRepository(session)
        self._context_service = DocumentContextService(
            session,
            default_max_context_tokens=self._settings.ai_max_context_tokens,
        )

    # -----------------------------------------------------------------------
    # Generation Workflow
    # -----------------------------------------------------------------------

    def generate_single_resource(
        self,
        document_id: uuid.UUID,
        resource_type: ResourceType,
        resource_id: uuid.UUID,
    ) -> StudyResource:
        """Execute AI generation for a specific resource, validate, and persist.

        Called by Celery worker task or direct execution.
        """
        logger.info(
            "Starting AI generation for document=%s, type=%s, resource_id=%s",
            document_id,
            resource_type.value,
            resource_id,
        )

        resource = self._resource_repo.get_by_id(resource_id)
        if not resource:
            raise ResourceNotFoundError(f"Resource {resource_id} not found")

        self._resource_repo.mark_generating(resource_id)
        doc = self._doc_repo.get_by_id_unscoped(document_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        try:
            # 1. Load grounded context
            context = self._context_service.prepare_context(document_id)

            # 2. Select prompt & schema
            messages, schema_cls = self._resolve_prompt_and_schema(
                resource_type=resource_type,
                doc_title=doc.original_filename,
                context=context,
            )

            # 3. Call AI Provider with JSON response format
            completion = self._provider.generate(
                messages=messages,
                model=self._settings.kilo_model,
                temperature=self._settings.ai_temperature,
                max_tokens=self._settings.ai_max_output_tokens,
                response_format={"type": "json_object"},
                timeout=float(self._settings.ai_request_timeout_seconds),
            )

            # 4. Parse, repair, and validate JSON output
            validated_content = self._parse_and_validate(
                raw_text=completion.content,
                schema_cls=schema_cls,
                context=context,
            )

            # 5. Persist as completed and active
            activated_resource = self._resource_repo.activate_successful_resource(
                resource_id=resource_id,
                content=validated_content,
                input_tokens=completion.input_tokens,
                output_tokens=completion.output_tokens,
            )

            # 6. Check if document status should be set to COMPLETED
            self._update_document_status_if_done(document_id)

            logger.info(
                "Successfully generated and persisted %s for document %s (resource_id=%s)",
                resource_type.value,
                document_id,
                resource_id,
            )
            return activated_resource

        except Exception as exc:
            logger.exception(
                "Generation failed for document %s, resource %s: %s",
                document_id,
                resource_id,
                exc,
            )
            err_msg = str(exc)
            self._resource_repo.mark_failed(resource_id, error_message=err_msg)
            self._update_document_status_if_done(document_id)
            raise

    def initialize_generation_jobs(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_types: list[ResourceType],
    ) -> list[StudyResource]:
        """Verify ownership and extraction status, then prepare StudyResource records."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        extraction = self._extraction_repo.get_by_document_id(document_id)
        if not extraction or extraction.status != ExtractionStatus.COMPLETED:
            raise ExtractionNotCompletedError(
                "Text extraction must be completed before AI study resources can be generated."
            )

        # Set document status to GENERATING
        doc.status = DocumentStatus.GENERATING
        self._session.flush()

        created_jobs: list[StudyResource] = []
        for r_type in resource_types:
            existing_active = self._resource_repo.get_active_by_type(document_id, r_type)
            if existing_active and existing_active.status == ResourceStatus.GENERATING:
                # Already generating this resource
                created_jobs.append(existing_active)
                continue

            current_ver = self._resource_repo.get_latest_version(document_id, r_type)
            # Create a pending resource job
            job = self._resource_repo.create(
                document_id=document_id,
                resource_type=r_type,
                model_name=self._settings.kilo_model,
                prompt_version="v1",
                status=ResourceStatus.PENDING,
                version=current_ver + 1,
                is_active=False if existing_active else True,
            )
            created_jobs.append(job)

        self._session.commit()
        return created_jobs

    def regenerate_resource(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_type: ResourceType,
    ) -> StudyResource:
        """Create a new version for a resource type without deleting previous successful version."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        existing_active = self._resource_repo.get_active_by_type(document_id, resource_type)
        if existing_active and existing_active.status == ResourceStatus.GENERATING:
            raise GenerationInProgressError(
                f"Generation for '{resource_type.value}' is already running."
            )

        doc.status = DocumentStatus.GENERATING
        current_ver = self._resource_repo.get_latest_version(document_id, resource_type)

        new_resource = self._resource_repo.create(
            document_id=document_id,
            resource_type=resource_type,
            model_name=self._settings.kilo_model,
            prompt_version="v1",
            status=ResourceStatus.PENDING,
            version=current_ver + 1,
            is_active=False if existing_active else True,
        )
        self._session.commit()
        return new_resource

    # -----------------------------------------------------------------------
    # Retrieval & Safe Viewing
    # -----------------------------------------------------------------------

    def list_active_resources(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        sanitize_quiz: bool = True,
    ) -> list[dict[str, Any]]:
        """List all active study resources, sanitizing unsubmitted quiz answer keys."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        resources = self._resource_repo.list_active_by_document(document_id)
        output: list[dict[str, Any]] = []
        for r in resources:
            r_dict = self._serialize_resource(r, sanitize_quiz=sanitize_quiz)
            output.append(r_dict)
        return output

    def get_resource_by_id(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        sanitize_quiz: bool = True,
    ) -> dict[str, Any]:
        """Retrieve single study resource by ID with ownership verification."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        resource = self._resource_repo.get_by_id(resource_id)
        if not resource or resource.document_id != document_id:
            raise ResourceNotFoundError(f"Study resource {resource_id} not found")

        return self._serialize_resource(resource, sanitize_quiz=sanitize_quiz)

    def get_generation_status(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Get status of each resource type for the document."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        statuses = self._resource_repo.get_generation_statuses(document_id)
        result: dict[str, Any] = {
            "document_id": str(document_id),
            "document_status": doc.status.value,
            "resources": {},
        }
        for r_type in ResourceType:
            r = statuses.get(r_type)
            if r:
                result["resources"][r_type.value] = {
                    "resource_id": str(r.id),
                    "status": r.status.value,
                    "version": r.version,
                    "is_active": r.is_active,
                    "error_message": r.error_message,
                    "updated_at": r.updated_at.isoformat() if r.updated_at else None,
                }
            else:
                result["resources"][r_type.value] = {
                    "resource_id": None,
                    "status": "not_started",
                    "version": 0,
                    "is_active": False,
                    "error_message": None,
                    "updated_at": None,
                }
        return result

    # -----------------------------------------------------------------------
    # Quiz Grading (Server-Side)
    # -----------------------------------------------------------------------

    def grade_quiz(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
        resource_id: uuid.UUID,
        user_answers: dict[str, int],
    ) -> QuizSubmissionResponse:
        """Evaluate submitted quiz answers against server-side answer key."""
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if not doc:
            raise DocumentNotFoundError(f"Document {document_id} not found")

        resource = self._resource_repo.get_by_id(resource_id)
        if not resource or resource.document_id != document_id:
            raise ResourceNotFoundError(f"Quiz resource {resource_id} not found")

        if resource.resource_type != ResourceType.QUIZ:
            raise ValueError(f"Resource {resource_id} is not a quiz")

        content = resource.content or {}
        questions_raw = content.get("questions", [])
        if not questions_raw:
            raise ValueError("Quiz has no questions to evaluate")

        results: list[QuestionGradeResult] = []
        correct_count = 0
        total_questions = len(questions_raw)

        for q in questions_raw:
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

        answered_count = sum(1 for q in questions_raw if str(q.get("id")) in user_answers)
        score_pct = round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0.0

        # Persist completed QuizAttempt for historical tracking
        attempt = self._progress_repo.create_quiz_attempt(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            resource_id=resource.id,
            total_questions=total_questions,
            correct_answers=correct_count,
            score_percentage=score_pct,
            submitted_answers=user_answers,
            graded_result=[r.model_dump() for r in results],
        )

        return QuizSubmissionResponse(
            resource_id=resource.id,
            total_questions=total_questions,
            answered_questions=answered_count,
            correct_answers=correct_count,
            score_percentage=score_pct,
            results=results,
            attempt_id=attempt.id,
            completed_at=attempt.completed_at,
        )

    # -----------------------------------------------------------------------
    # Internal Helpers: Prompt Resolution, Parsing & Validation
    # -----------------------------------------------------------------------

    def _resolve_prompt_and_schema(
        self,
        resource_type: ResourceType,
        doc_title: str,
        context: DocumentContext,
    ) -> tuple[list[dict[str, str]], Type[BaseModel]]:
        """Map resource type to prompt constructor and Pydantic validator."""
        text = context.formatted_text

        if resource_type == ResourceType.NOTES:
            return build_notes_prompt(doc_title, text), NotesContent
        elif resource_type == ResourceType.QUESTIONS:
            return build_questions_prompt(doc_title, text), QuestionsContent
        elif resource_type == ResourceType.FLASHCARDS:
            return build_flashcards_prompt(doc_title, text), FlashcardsContent
        elif resource_type == ResourceType.QUIZ:
            return build_quiz_prompt(doc_title, text), QuizContent
        elif resource_type == ResourceType.SUMMARY:
            return build_summary_prompt(doc_title, text), SummaryContent
        else:
            raise ValueError(f"Unsupported resource type: {resource_type}")

    def _parse_and_validate(
        self,
        raw_text: str,
        schema_cls: Type[BaseModel],
        context: DocumentContext,
    ) -> dict[str, Any]:
        """Extract, repair, and validate JSON output against Pydantic schema."""
        parsed_dict = self._extract_json(raw_text)

        try:
            validated = schema_cls.model_validate(parsed_dict)
            dumped = validated.model_dump()
            # Post-validate & sanitize page references to valid range
            self._sanitize_source_pages(dumped, min_p=context.min_page, max_p=context.max_page)
            return dumped
        except ValidationError as err:
            logger.warning(
                "Model response failed Pydantic validation: %s. Attempting bounded repair...",
                err,
            )
            repaired = self._attempt_bounded_repair(raw_text, str(err), schema_cls)
            if repaired:
                self._sanitize_source_pages(repaired, min_p=context.min_page, max_p=context.max_page)
                return repaired
            raise AIValidationError(
                f"Generated content failed schema validation: {err}"
            ) from err

    def _extract_json(self, raw_text: str) -> dict[str, Any]:
        """Safely extract JSON dictionary from raw model text."""
        cleaned = raw_text.strip()

        # 1. Direct parse attempt
        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

        # 2. Markdown code fences ```json ... ```
        fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", cleaned)
        if fence_match:
            try:
                data = json.loads(fence_match.group(1))
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass

        # 3. Outer-most curly braces
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            substring = cleaned[start : end + 1]
            try:
                data = json.loads(substring)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass

        raise AIValidationError(
            f"Could not parse valid JSON object from model response: {cleaned[:200]}"
        )

    def _attempt_bounded_repair(
        self,
        malformed_text: str,
        error_description: str,
        schema_cls: Type[BaseModel],
    ) -> dict[str, Any] | None:
        """One bounded repair call asking the LLM to fix syntax/schema issues."""
        repair_messages = [
            {
                "role": "system",
                "content": (
                    "You are a JSON repair assistant. Fix the following invalid JSON payload so that it "
                    "strictly satisfies the requested schema. Respond ONLY with the fixed JSON object."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Error encountered:\n{error_description}\n\n"
                    f"Malformed JSON:\n{malformed_text[:3000]}\n\n"
                    "Please return the corrected valid JSON object."
                ),
            },
        ]
        try:
            logger.info("Executing bounded LLM repair request...")
            res = self._provider.generate(
                messages=repair_messages,
                temperature=0.0,
                max_tokens=self._settings.ai_max_output_tokens,
                response_format={"type": "json_object"},
                timeout=30.0,
            )
            repaired_dict = self._extract_json(res.content)
            validated = schema_cls.model_validate(repaired_dict)
            logger.info("Bounded LLM repair succeeded!")
            return validated.model_dump()
        except Exception as exc:
            logger.warning("Bounded repair call failed: %s", exc)
            return None

    def _sanitize_source_pages(
        self, data: Any, min_p: int, max_p: int
    ) -> None:
        """Recursively clamp or prune page numbers outside the document's actual page bounds."""
        if isinstance(data, dict):
            if "source_pages" in data and isinstance(data["source_pages"], list):
                valid_pages = [
                    int(p)
                    for p in data["source_pages"]
                    if isinstance(p, (int, str)) and str(p).isdigit() and min_p <= int(p) <= max_p
                ]
                if not valid_pages:
                    # If model invented pages outside boundary, clamp to first page
                    valid_pages = [min_p]
                data["source_pages"] = sorted(set(valid_pages))
            for val in data.values():
                self._sanitize_source_pages(val, min_p, max_p)
        elif isinstance(data, list):
            for item in data:
                self._sanitize_source_pages(item, min_p, max_p)

    def _serialize_resource(
        self, resource: StudyResource, sanitize_quiz: bool = True
    ) -> dict[str, Any]:
        """Convert StudyResource ORM model to dictionary with safe quiz sanitization."""
        raw_content = resource.content
        if sanitize_quiz and resource.resource_type == ResourceType.QUIZ:
            display_content = sanitize_quiz_content_for_client(raw_content)
        else:
            display_content = raw_content

        return {
            "id": str(resource.id),
            "document_id": str(resource.document_id),
            "resource_type": resource.resource_type.value,
            "status": resource.status.value,
            "content": display_content,
            "model_name": resource.model_name,
            "prompt_version": resource.prompt_version,
            "version": resource.version,
            "is_active": resource.is_active,
            "input_tokens": resource.input_tokens,
            "output_tokens": resource.output_tokens,
            "error_message": resource.error_message,
            "created_at": resource.created_at.isoformat() if resource.created_at else None,
            "updated_at": resource.updated_at.isoformat() if resource.updated_at else None,
        }

    def _update_document_status_if_done(self, document_id: uuid.UUID) -> None:
        """Mark Document as COMPLETED or FAILED if all active study resources have finished."""
        doc = self._doc_repo.get_by_id_unscoped(document_id)
        if not doc:
            return
        active_resources = self._resource_repo.list_active_by_document(document_id)
        any_generating = any(
            r.status in (ResourceStatus.PENDING, ResourceStatus.GENERATING)
            for r in active_resources
        )
        if not any_generating and doc.status == DocumentStatus.GENERATING:
            any_completed = any(r.status == ResourceStatus.COMPLETED for r in active_resources)
            doc.status = DocumentStatus.COMPLETED if any_completed else DocumentStatus.FAILED
            self._session.flush()

