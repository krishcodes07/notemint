"""CLI utilities for maintenance and reconciliation (Phase 6)."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

from app.db.session import get_session_factory
from app.models.document import Document, DocumentStatus
from app.repositories.document_repository import DocumentRepository
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

    args = parser.parse_args()

    if args.command == "reconcile":
        reconcile_pending_documents(limit=args.limit)


if __name__ == "__main__":
    main()

