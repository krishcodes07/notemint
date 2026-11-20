"""Celery background tasks for PDF extraction (Phase 6)."""

from __future__ import annotations

import logging
import os
import tempfile
import uuid
from typing import Any

from app.core.celery_app import celery_app
from app.db.session import get_session_factory
from app.integrations.neon_storage import (
    StorageObjectNotFoundError,
    StorageUnavailableError,
)
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import ExtractionStatus
from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.services.pdf_extraction_service import (
    CorruptedPdfError,
    EmptyPdfError,
    EncryptedPdfError,
    ExtractionLimitExceededError,
    PdfExtractionError,
    PdfExtractionService,
)
from app.services.storage_service import StorageService, get_storage_service

logger = logging.getLogger(__name__)


def is_broker_reachable(broker_url: str, timeout: float = 0.2) -> bool:
    """Fast socket probe to check if broker host/port is reachable."""
    try:
        from urllib.parse import urlparse
        import socket

        parsed = urlparse(broker_url)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or 6379
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def enqueue_extraction_task(document_id: uuid.UUID) -> bool:
    """Safely enqueue an extraction task.

    Returns True if successfully queued to the broker (or executed eagerly),
    or False if Redis/broker is offline (allowing the upload or reprocess request
    to complete safely without blocking).
    """
    if celery_app.conf.task_always_eager:
        try:
            process_document_extraction.apply_async(args=[str(document_id)])
            logger.info("Executed extraction task eagerly for document %s", document_id)
            return True
        except Exception as exc:
            logger.warning("Eager extraction task failed for document %s: %s", document_id, exc)
            return False

    broker_url = str(celery_app.conf.broker_url or "")
    if broker_url and not is_broker_reachable(broker_url, timeout=0.15):
        logger.warning(
            "Celery broker (%s) is unreachable; task for document %s not enqueued. "
            "Document remains in 'uploaded' status for reconciliation or reprocess.",
            broker_url,
            document_id,
        )
        return False

    try:
        process_document_extraction.apply_async(
            args=[str(document_id)],
            retry=False,
        )
        logger.info("Successfully enqueued extraction task for document %s", document_id)
        return True
    except Exception as exc:
        logger.warning(
            "Could not enqueue extraction task for document %s: %s (%s). "
            "Document remains in 'uploaded' status.",
            document_id,
            type(exc).__name__,
            exc,
        )
        return False


@celery_app.task(
    bind=True,
    name="app.tasks.extraction.process_document_extraction",
    max_retries=3,
    default_retry_delay=10,
)
def process_document_extraction(self: Any, document_id_str: str) -> dict[str, Any]:
    """Execute background PDF extraction for a document.

    Steps:
    1. Validate document exists in database.
    2. Transition status to EXTRACTING.
    3. Stream file from private object storage to a temporary file.
    4. Run PdfExtractionService to extract text, pages, and diagnostics.
    5. Persist extraction record and page records inside a single transaction.
    6. Transition document status to COMPLETED (or FAILED if scanned/empty/corrupted).
    7. Clean up temporary files safely in a finally block.
    """
    try:
        document_id = uuid.UUID(document_id_str)
    except (ValueError, TypeError):
        logger.error("Invalid document UUID passed to extraction task: %s", document_id_str)
        return {"status": "error", "message": "Invalid document UUID"}

    logger.info("Starting background PDF extraction for document %s", document_id)

    session_factory = get_session_factory()
    storage_service: StorageService = get_storage_service()
    extraction_service = PdfExtractionService()

    with session_factory() as session:
        doc_repo = DocumentRepository(session)
        extraction_repo = ExtractionRepository(session)

        # 1. Fetch document
        doc = doc_repo.get_by_id_unscoped(document_id)
        if doc is None:
            logger.warning("Document %s not found in database; aborting task", document_id)
            return {"status": "not_found", "document_id": document_id_str}

        # 2. Update status to EXTRACTING
        extraction_repo.mark_extracting(document_id)
        session.commit()

        # 3. Stream PDF from private storage to a secure temporary file
        temp_file = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
        temp_path = temp_file.name

        try:
            try:
                storage_service.download_fileobj(doc.storage_key, temp_file)
                temp_file.flush()
                temp_file.close()
            except StorageUnavailableError as storage_exc:
                if self.request.retries < self.max_retries:
                    countdown = 10 * (2 ** self.request.retries)
                    logger.warning(
                        "Storage unavailable for document %s, retrying in %ds (attempt %d/%d)",
                        document_id,
                        countdown,
                        self.request.retries + 1,
                        self.max_retries,
                    )
                    raise self.retry(exc=storage_exc, countdown=countdown)

                error_msg = "Storage service unavailable after multiple retries"
                logger.error("Max retries exceeded downloading document %s: %s", document_id, error_msg)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            except StorageObjectNotFoundError:
                error_msg = "PDF file not found in storage bucket"
                logger.error("Storage key %s not found for document %s", doc.storage_key, document_id)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            # 4. Extract text, metadata, and quality
            try:
                result = extraction_service.extract_from_path(temp_path)
            except EncryptedPdfError:
                error_msg = "PDF is password-protected or encrypted. Please remove password protection."
                logger.info("PDF %s is encrypted", document_id)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            except CorruptedPdfError:
                error_msg = "PDF file appears to be corrupted or invalid."
                logger.warning("PDF %s is corrupted or invalid", document_id)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            except EmptyPdfError:
                error_msg = "PDF contains no pages."
                logger.info("PDF %s is empty", document_id)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            except ExtractionLimitExceededError as limit_exc:
                error_msg = str(limit_exc)
                logger.warning("PDF %s exceeded extraction limits: %s", document_id, error_msg)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            except Exception as exc:
                error_msg = "An unexpected error occurred during PDF text extraction."
                logger.exception("Unexpected error extracting document %s: %s", document_id, type(exc).__name__)
                extraction_repo.mark_failed(document_id, error_msg)
                session.commit()
                return {"status": "failed", "document_id": document_id_str, "error": error_msg}

            # 5. Persist extraction results safely
            if result.quality.is_scanned or not result.quality.extraction_success:
                status = ExtractionStatus.FAILED
                error_msg = result.quality.reason or "Scanned PDF: no usable text found. OCR required."
                logger.info("Document %s is scanned or has no usable text; marked failed", document_id)
            else:
                status = ExtractionStatus.COMPLETED
                error_msg = None
                logger.info(
                    "Document %s text extraction completed: %d pages, %d characters",
                    document_id,
                    result.page_count,
                    result.total_characters,
                )

            extraction_repo.save_extraction_results(
                document_id=document_id,
                result=result,
                status=status,
                error_message=error_msg,
            )
            session.commit()

            return {
                "status": status.value,
                "document_id": document_id_str,
                "page_count": result.page_count,
                "total_characters": result.total_characters,
                "is_scanned": result.quality.is_scanned,
                "ocr_required": result.quality.ocr_required,
            }

        finally:
            # 6. Safe temporary file cleanup
            try:
                if not temp_file.closed:
                    temp_file.close()
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            except Exception as cleanup_exc:
                logger.warning("Failed to clean up temporary file %s: %s", temp_path, cleanup_exc)

