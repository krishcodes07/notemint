"""Celery background tasks for document vector indexing (Phase 10)."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.core.celery_app import celery_app
from app.db.session import get_session_factory
from app.models.document_extraction import ExtractionStatus
from app.repositories.extraction_repository import ExtractionRepository
from app.services.document_indexing_service import DocumentIndexingError, DocumentIndexingService
from app.tasks.extraction import is_broker_reachable

logger = logging.getLogger(__name__)


def enqueue_indexing_task(document_id: uuid.UUID, force: bool = False) -> bool:
    """Safely enqueue an indexing task for a document.

    Returns True if successfully queued to the broker (or executed eagerly),
    or False if Redis/broker is offline (allowing caller to complete safely without blocking).
    """
    if celery_app.conf.task_always_eager:
        try:
            index_document_embeddings_task.apply_async(args=[str(document_id), force])
            logger.info("Executed indexing task eagerly for document %s", document_id)
            return True
        except Exception as exc:
            logger.warning("Eager indexing task failed for document %s: %s", document_id, exc)
            return False

    broker_url = str(celery_app.conf.broker_url or "")
    if broker_url and not is_broker_reachable(broker_url, timeout=0.15):
        logger.warning(
            "Celery broker (%s) is unreachable; indexing task for document %s not enqueued. "
            "Use CLI backfill or reindex API to index later.",
            broker_url,
            document_id,
        )
        return False

    try:
        index_document_embeddings_task.apply_async(
            args=[str(document_id), force],
            retry=False,
        )
        logger.info("Successfully enqueued vector indexing task for document %s", document_id)
        return True
    except Exception as exc:
        logger.warning(
            "Could not enqueue indexing task for document %s: %s (%s).",
            document_id,
            type(exc).__name__,
            exc,
        )
        return False


@celery_app.task(
    bind=True,
    name="app.tasks.document_indexing_tasks.index_document_embeddings_task",
    max_retries=3,
    default_retry_delay=15,
)
def index_document_embeddings_task(
    self: Any, document_id_str: str, force: bool = False
) -> dict[str, Any]:
    """Execute background vector indexing for a document."""
    try:
        document_id = uuid.UUID(document_id_str)
    except (ValueError, TypeError):
        logger.error("Invalid document UUID passed to indexing task: %s", document_id_str)
        return {"status": "error", "message": "Invalid document UUID"}

    logger.info("Starting background vector indexing for document %s (force=%s)", document_id, force)

    session_factory = get_session_factory()
    with session_factory() as session:
        extraction_repo = ExtractionRepository(session)
        extraction = extraction_repo.get_by_document_id(document_id)

        # Confirm extraction is complete
        if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
            status_str = extraction.status.value if extraction else "missing"
            logger.warning(
                "Document %s extraction not completed (status: %s); aborting indexing task.",
                document_id,
                status_str,
            )
            return {"status": "skipped", "reason": f"extraction status: {status_str}"}

        indexing_service = DocumentIndexingService(session)
        try:
            index_record = indexing_service.index_document(document_id, force=force)
            return {
                "status": index_record.status,
                "document_id": document_id_str,
                "chunk_count": index_record.chunk_count,
                "embedding_model": index_record.embedding_model,
            }
        except Exception as exc:
            if self.request.retries < self.max_retries:
                countdown = 15 * (2 ** self.request.retries)
                logger.warning(
                    "Indexing failed for document %s; retrying in %ds (attempt %d/%d): %s",
                    document_id,
                    countdown,
                    self.request.retries + 1,
                    self.max_retries,
                    exc,
                )
                raise self.retry(exc=exc, countdown=countdown)

            logger.exception("Max retries exceeded indexing document %s: %s", document_id, exc)
            return {
                "status": "failed",
                "document_id": document_id_str,
                "error": str(exc),
            }

