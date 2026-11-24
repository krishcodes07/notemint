"""CLI utilities for maintenance and reconciliation (Phase 6)."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

from app.core.config import settings
from app.db.session import get_session_factory
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import DocumentExtraction, ExtractionStatus
from app.models.document_index import DocumentIndex, IndexStatus
from app.repositories.document_index_repository import DocumentIndexRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.tasks.document_indexing_tasks import enqueue_indexing_task
from app.tasks.extraction import enqueue_extraction_task

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("notemint.cli")


def reconcile_pending_documents(limit: int = 100) -> int:
    """Find documents stuck in 'uploaded' status and re-enqueue them for extraction."""
    session_factory = get_session_factory()
    reconciled_count = 0

    with session_factory() as session:
        doc_repo = DocumentRepository(session)
        pending_docs = doc_repo.list_by_status(DocumentStatus.UPLOADED, limit=limit)

        logger.info("Found %d pending document(s) in 'uploaded' status", len(pending_docs))

        for doc in pending_docs:
            logger.info("Re-enqueuing document %s (%s)", doc.id, doc.original_filename)
            enqueued = enqueue_extraction_task(doc.id)
            if enqueued:
                reconciled_count += 1

    logger.info("Reconciliation complete. Successfully enqueued %d document(s).", reconciled_count)
    return reconciled_count


def backfill_document_indexes(limit: int = 100, force: bool = False) -> int:
    """Find extracted documents without a valid active vector index and enqueue indexing jobs."""
    session_factory = get_session_factory()
    queued_count = 0

    with session_factory() as session:
        index_repo = DocumentIndexRepository(session)
        from sqlalchemy import select

        stmt = (
            select(DocumentExtraction)
            .where(
                DocumentExtraction.status == ExtractionStatus.COMPLETED,
            )
            .limit(limit)
        )
        extractions = list(session.scalars(stmt).all())
        logger.info("Found %d completed text extractions to inspect for indexing", len(extractions))

        for ext in extractions:
            if ext.quality and ext.quality.get("is_scanned"):
                continue
            doc_id = ext.document_id
            idx = index_repo.get_by_document_id(doc_id)
            if not force and idx is not None:
                if (
                    idx.status in (IndexStatus.COMPLETED.value, IndexStatus.INDEXING.value)
                    and idx.embedding_model == settings.embedding_model
                    and idx.embedding_dimensions == settings.embedding_dimensions
                ):
                    continue

            logger.info("Enqueuing indexing for document %s (current index: %s)", doc_id, idx.status if idx else "none")
            enqueued = enqueue_indexing_task(doc_id, force=force)
            if enqueued:
                queued_count += 1

    logger.info("Backfill complete. Enqueued %d document(s) for indexing.", queued_count)
    return queued_count


def main() -> None:
    parser = argparse.ArgumentParser(description="NoteMint CLI Management Tools")
    subparsers = parser.add_subparsers(dest="command", required=True)

    reconcile_parser = subparsers.add_parser(
        "reconcile",
        help="Reconcile documents stuck in 'uploaded' status by re-enqueuing extraction tasks",
    )
    reconcile_parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum documents to reconcile (default: 100)",
    )

    index_parser = subparsers.add_parser(
        "index-documents",
        help="Backfill vector embeddings for extracted documents",
    )
    index_parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum documents to inspect (default: 100)",
    )
    index_parser.add_argument(
        "--force",
        action="store_true",
        help="Force reindexing even if already completed",
    )

    args = parser.parse_args()

    if args.command == "reconcile":
        reconcile_pending_documents(limit=args.limit)
    elif args.command == "index-documents":
        backfill_document_indexes(limit=args.limit, force=args.force)


if __name__ == "__main__":
    main()

