"""Celery background tasks for AI study resource generation (Phase 7)."""

from __future__ import annotations

import logging
import threading
import uuid
from typing import Any

from app.ai.base import (
    AIAuthenticationError,
    AIModelNotFoundError,
    AIProviderError,
    AIQuotaExceededError,
    AIRateLimitError,
    AITimeoutError,
    AIValidationError,
)
from app.ai.provider_factory import get_ai_provider
from app.core.celery_app import celery_app
from app.db.session import get_session_factory
from app.models.study_resource import ResourceType
from app.services.ai_generation_service import AIGenerationService
from app.services.additional_generation_service import AdditionalGenerationService
from app.tasks.extraction import is_broker_reachable

logger = logging.getLogger(__name__)


def execute_ai_generation(
    document_id_str: str,
    resource_type_str: str,
    resource_id_str: str,
    task_self: Any = None,
) -> dict[str, Any]:
    """Execute AI generation for a single study resource."""
    document_id = uuid.UUID(document_id_str)
    resource_type = ResourceType(resource_type_str)
    resource_id = uuid.UUID(resource_id_str)

    logger.info(
        "Starting AI generation task execution for doc=%s, type=%s, res=%s",
        document_id,
        resource_type.value,
        resource_id,
    )

    session_factory = get_session_factory()
    session = session_factory()
    try:
        provider = get_ai_provider()
        service = AIGenerationService(session=session, provider=provider)
        resource = service.generate_single_resource(
            document_id=document_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        session.commit()
        return {
            "status": "success",
            "document_id": document_id_str,
            "resource_type": resource_type_str,
            "resource_id": resource_id_str,
            "resource_status": resource.status.value,
        }

    except (
        AIAuthenticationError,
        AIModelNotFoundError,
        AIQuotaExceededError,
        AIValidationError,
    ) as permanent_exc:
        logger.error(
            "Permanent AI error for doc=%s, type=%s: %s. Not retrying.",
            document_id,
            resource_type.value,
            permanent_exc,
        )
        session.rollback()
        try:
            from app.repositories.study_resource_repository import StudyResourceRepository

            StudyResourceRepository(session).mark_failed(
                resource_id, error_message=str(permanent_exc)
            )
            service = AIGenerationService(session=session, provider=get_ai_provider())
            service._update_document_status_if_done(document_id)
            session.commit()
        except Exception:
            session.rollback()

        return {
            "status": "failed",
            "document_id": document_id_str,
            "resource_type": resource_type_str,
            "resource_id": resource_id_str,
            "error": str(permanent_exc),
            "permanent": True,
        }

    except (AIRateLimitError, AITimeoutError) as transient_exc:
        retries = getattr(getattr(task_self, "request", None), "retries", 0)
        max_retries = getattr(task_self, "max_retries", 3)
        logger.warning(
            "Transient AI error for doc=%s, type=%s: %s (attempt %d/%d)",
            document_id,
            resource_type.value,
            transient_exc,
            retries + 1,
            max_retries,
        )
        session.rollback()
        if task_self is not None and hasattr(task_self, "retry"):
            try:
                raise task_self.retry(exc=transient_exc)
            except Exception:
                pass

        try:
            from app.repositories.study_resource_repository import StudyResourceRepository

            StudyResourceRepository(session).mark_failed(
                resource_id, error_message=f"Rate limit / timeout: {transient_exc}"
            )
            service = AIGenerationService(session=session, provider=get_ai_provider())
            service._update_document_status_if_done(document_id)
            session.commit()
        except Exception:
            session.rollback()
        return {
            "status": "failed",
            "document_id": document_id_str,
            "resource_type": resource_type_str,
            "resource_id": resource_id_str,
            "error": str(transient_exc),
            "transient": True,
        }

    except Exception as exc:
        logger.exception(
            "Unexpected error during AI generation for doc=%s, type=%s: %s",
            document_id,
            resource_type.value,
            exc,
        )
        session.rollback()
        try:
            from app.repositories.study_resource_repository import StudyResourceRepository

            StudyResourceRepository(session).mark_failed(
                resource_id, error_message=str(exc)
            )
            service = AIGenerationService(session=session, provider=get_ai_provider())
            service._update_document_status_if_done(document_id)
            session.commit()
        except Exception:
            session.rollback()
        return {
            "status": "failed",
            "document_id": document_id_str,
            "resource_type": resource_type_str,
            "resource_id": resource_id_str,
            "error": str(exc),
        }

    finally:
        session.close()


def _run_in_background_thread(
    document_id_str: str,
    resource_type_str: str,
    resource_id_str: str,
) -> None:
    """Execute generation task in a background daemon thread."""
    try:
        execute_ai_generation(document_id_str, resource_type_str, resource_id_str, task_self=None)
    except Exception as exc:
        logger.exception("Background execution of AI generation task failed: %s", exc)
        try:
            SessionLocal = get_session_factory()
            with SessionLocal() as session:
                from app.repositories.study_resource_repository import StudyResourceRepository

                StudyResourceRepository(session).mark_failed(
                    uuid.UUID(resource_id_str), error_message=str(exc)
                )
                session.commit()
        except Exception:
            pass


def enqueue_ai_generation_task(
    document_id: uuid.UUID,
    resource_type: ResourceType,
    resource_id: uuid.UUID,
) -> bool:
    """Safely enqueue an AI resource generation task to Celery or in-process background thread."""
    if celery_app.conf.task_always_eager:
        # Run in a background thread so the HTTP request returns immediately without blocking
        thread = threading.Thread(
            target=_run_in_background_thread,
            args=(str(document_id), resource_type.value, str(resource_id)),
            daemon=True,
            name=f"ai-gen-{resource_type.value}-{resource_id}",
        )
        thread.start()
        logger.info(
            "Launched AI generation task in background thread for doc=%s, type=%s, res=%s",
            document_id,
            resource_type.value,
            resource_id,
        )
        return True

    broker_url = str(celery_app.conf.broker_url or "")
    if broker_url and not is_broker_reachable(broker_url, timeout=0.15):
        logger.warning(
            "Celery broker (%s) unreachable; falling back to background thread for doc=%s, type=%s.",
            broker_url,
            document_id,
            resource_type.value,
        )
        thread = threading.Thread(
            target=_run_in_background_thread,
            args=(str(document_id), resource_type.value, str(resource_id)),
            daemon=True,
            name=f"ai-gen-fallback-{resource_type.value}-{resource_id}",
        )
        thread.start()
        return True

    try:
        generate_study_resource_task.apply_async(
            args=[str(document_id), resource_type.value, str(resource_id)],
            retry=False,
        )
        logger.info(
            "Successfully enqueued AI generation task for doc=%s, type=%s, res=%s",
            document_id,
            resource_type.value,
            resource_id,
        )
        return True
    except Exception as exc:
        logger.warning(
            "Could not enqueue AI generation task for doc=%s: %s",
            document_id,
            exc,
        )
        return False


@celery_app.task(
    bind=True,
    name="app.tasks.ai_generation_tasks.generate_study_resource_task",
    max_retries=3,
    default_retry_delay=5,
)
def generate_study_resource_task(
    self: Any,
    document_id_str: str,
    resource_type_str: str,
    resource_id_str: str,
) -> dict[str, Any]:
    """Celery task entry point."""
    return execute_ai_generation(document_id_str, resource_type_str, resource_id_str, task_self=self)


# -----------------------------------------------------------------------------
# Phase 11: Additional Custom Generation Tasks
# -----------------------------------------------------------------------------


def execute_additional_generation(
    document_id_str: str,
    batch_id_str: str,
    task_self: Any = None,
) -> dict[str, Any]:
    """Execute AI generation for an on-demand additional practice batch."""
    document_id = uuid.UUID(document_id_str)
    batch_id = uuid.UUID(batch_id_str)

    logger.info(
        "Starting additional AI generation task execution for doc=%s, batch=%s",
        document_id,
        batch_id,
    )

    session_factory = get_session_factory()
    session = session_factory()
    try:
        provider = get_ai_provider()
        service = AdditionalGenerationService(session=session, provider=provider)
        resource = service.process_generation_batch(batch_id=batch_id)
        return {
            "status": "success",
            "document_id": document_id_str,
            "batch_id": batch_id_str,
            "resource_id": str(resource.id),
            "resource_type": resource.resource_type.value,
        }

    except (
        AIAuthenticationError,
        AIModelNotFoundError,
        AIQuotaExceededError,
        AIValidationError,
    ) as permanent_exc:
        logger.error(
            "Permanent AI error for doc=%s, batch=%s: %s. Not retrying.",
            document_id,
            batch_id,
            permanent_exc,
        )
        session.rollback()
        try:
            from app.repositories.study_generation_batch_repository import (
                StudyGenerationBatchRepository,
            )

            StudyGenerationBatchRepository(session).mark_failed(
                batch_id, error_message=str(permanent_exc)
            )
            session.commit()
        except Exception:
            session.rollback()

        return {
            "status": "failed",
            "document_id": document_id_str,
            "batch_id": batch_id_str,
            "error": str(permanent_exc),
            "permanent": True,
        }

    except (AIRateLimitError, AITimeoutError) as transient_exc:
        retries = getattr(getattr(task_self, "request", None), "retries", 0)
        max_retries = getattr(task_self, "max_retries", 3)
        logger.warning(
            "Transient AI error for doc=%s, batch=%s: %s (attempt %d/%d)",
            document_id,
            batch_id,
            transient_exc,
            retries + 1,
            max_retries,
        )
        session.rollback()
        if task_self is not None and hasattr(task_self, "retry"):
            try:
                raise task_self.retry(exc=transient_exc)
            except Exception:
                pass

        try:
            from app.repositories.study_generation_batch_repository import (
                StudyGenerationBatchRepository,
            )

            StudyGenerationBatchRepository(session).mark_failed(
                batch_id, error_message=f"Rate limit / timeout: {transient_exc}"
            )
            session.commit()
        except Exception:
            session.rollback()
        return {
            "status": "failed",
            "document_id": document_id_str,
            "batch_id": batch_id_str,
            "error": str(transient_exc),
            "transient": True,
        }

    except Exception as exc:
        logger.exception(
            "Unexpected error during additional AI generation for doc=%s, batch=%s: %s",
            document_id,
            batch_id,
            exc,
        )
        session.rollback()
        try:
            from app.repositories.study_generation_batch_repository import (
                StudyGenerationBatchRepository,
            )

            StudyGenerationBatchRepository(session).mark_failed(
                batch_id, error_message=str(exc)
            )
            session.commit()
        except Exception:
            session.rollback()
        return {
            "status": "failed",
            "document_id": document_id_str,
            "batch_id": batch_id_str,
            "error": str(exc),
        }

    finally:
        session.close()


def _run_additional_in_background_thread(
    document_id_str: str,
    batch_id_str: str,
) -> None:
    """Execute additional generation task in a background daemon thread."""
    try:
        execute_additional_generation(document_id_str, batch_id_str, task_self=None)
    except Exception as exc:
        logger.exception("Background execution of additional generation task failed: %s", exc)


def enqueue_additional_generation_task(
    document_id: uuid.UUID,
    batch_id: uuid.UUID,
) -> bool:
    """Safely enqueue an additional generation batch task to Celery or in-process background thread."""
    if celery_app.conf.task_always_eager:
        thread = threading.Thread(
            target=_run_additional_in_background_thread,
            args=(str(document_id), str(batch_id)),
            daemon=True,
            name=f"ai-gen-more-{batch_id}",
        )
        thread.start()
        logger.info(
            "Launched additional generation task in background thread for doc=%s, batch=%s",
            document_id,
            batch_id,
        )
        return True

    broker_url = str(celery_app.conf.broker_url or "")
    if broker_url and not is_broker_reachable(broker_url, timeout=0.15):
        logger.warning(
            "Celery broker (%s) unreachable; falling back to background thread for doc=%s, batch=%s.",
            broker_url,
            document_id,
            batch_id,
        )
        thread = threading.Thread(
            target=_run_additional_in_background_thread,
            args=(str(document_id), str(batch_id)),
            daemon=True,
            name=f"ai-gen-more-fallback-{batch_id}",
        )
        thread.start()
        return True

    try:
        generate_additional_study_items_task.apply_async(
            args=[str(document_id), str(batch_id)],
            retry=False,
        )
        logger.info(
            "Successfully enqueued additional generation task for doc=%s, batch=%s",
            document_id,
            batch_id,
        )
        return True
    except Exception as exc:
        logger.warning(
            "Could not enqueue additional generation task for doc=%s, batch=%s: %s",
            document_id,
            batch_id,
            exc,
        )
        return False


@celery_app.task(
    bind=True,
    name="app.tasks.ai_generation_tasks.generate_additional_study_items_task",
    max_retries=3,
    default_retry_delay=5,
)
def generate_additional_study_items_task(
    self: Any,
    document_id_str: str,
    batch_id_str: str,
) -> dict[str, Any]:
    """Celery task entry point for additional study items generation."""
    return execute_additional_generation(document_id_str, batch_id_str, task_self=self)


