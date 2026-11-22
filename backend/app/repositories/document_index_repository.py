"""Repository for DocumentIndex tracking and state transitions (Phase 10)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document_index import DocumentIndex, IndexStatus

logger = logging.getLogger(__name__)


class DocumentIndexRepository:
    """Manages database operations for DocumentIndex records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_document_id(self, document_id: uuid.UUID) -> DocumentIndex | None:
        """Fetch index record for a document if one exists."""
        stmt = select(DocumentIndex).where(DocumentIndex.document_id == document_id)
        return self._session.scalar(stmt)

    def create_or_update_index(
        self,
        document_id: uuid.UUID,
        status: str,
        embedding_provider: str,
        embedding_model: str,
        embedding_dimensions: int,
        chunk_count: int = 0,
        indexed_at: datetime | None = None,
        error_message: str | None = None,
    ) -> DocumentIndex:
        """Upsert DocumentIndex state for a document."""
        idx = self.get_by_document_id(document_id)
        now = datetime.now(timezone.utc)

        if idx is None:
            idx = DocumentIndex(
                document_id=document_id,
                status=status,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                embedding_dimensions=embedding_dimensions,
                chunk_count=chunk_count,
                indexed_at=indexed_at,
                error_message=error_message,
            )
            self._session.add(idx)
        else:
            idx.status = status
            idx.embedding_provider = embedding_provider
            idx.embedding_model = embedding_model
            idx.embedding_dimensions = embedding_dimensions
            idx.chunk_count = chunk_count
            idx.indexed_at = indexed_at
            idx.error_message = error_message
            idx.updated_at = now

        self._session.flush()
        return idx

    def mark_indexing(
        self,
        document_id: uuid.UUID,
        embedding_provider: str,
        embedding_model: str,
        embedding_dimensions: int,
    ) -> DocumentIndex:
        """Mark index status as INDEXING."""
        return self.create_or_update_index(
            document_id=document_id,
            status=IndexStatus.INDEXING.value,
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            embedding_dimensions=embedding_dimensions,
            error_message=None,
        )

    def mark_completed(
        self,
        document_id: uuid.UUID,
        embedding_provider: str,
        embedding_model: str,
        embedding_dimensions: int,
        chunk_count: int,
    ) -> DocumentIndex:
        """Mark index status as COMPLETED."""
        return self.create_or_update_index(
            document_id=document_id,
            status=IndexStatus.COMPLETED.value,
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            embedding_dimensions=embedding_dimensions,
            chunk_count=chunk_count,
            indexed_at=datetime.now(timezone.utc),
            error_message=None,
        )

    def mark_failed(
        self,
        document_id: uuid.UUID,
        error_message: str,
        embedding_provider: str = "local",
        embedding_model: str = "unknown",
        embedding_dimensions: int = 384,
    ) -> DocumentIndex:
        """Mark index status as FAILED."""
        return self.create_or_update_index(
            document_id=document_id,
            status=IndexStatus.FAILED.value,
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            embedding_dimensions=embedding_dimensions,
            error_message=error_message,
        )

