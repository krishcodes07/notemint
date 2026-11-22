"""Data access operations for study generation batches."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.study_generation_batch import BatchStatus, StudyGenerationBatch

logger = logging.getLogger(__name__)


class StudyGenerationBatchRepository:
    """Repository handling persistence and retrieval of StudyGenerationBatch records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        document_id: uuid.UUID,
        resource_type: str,
        difficulty: str,
        requested_count: int,
        model_name: str,
        *,
        topic: str | None = None,
        prompt_version: str = "v1",
        status: str = BatchStatus.PENDING.value,
        batch_id: uuid.UUID | None = None,
    ) -> StudyGenerationBatch:
        """Create and persist a new generation batch record."""
        batch = StudyGenerationBatch(
            id=batch_id or uuid.uuid4(),
            document_id=document_id,
            resource_type=resource_type,
            difficulty=difficulty,
            requested_count=requested_count,
            generated_count=0,
            topic=topic,
            status=status,
            model_name=model_name,
            prompt_version=prompt_version,
        )
        self._session.add(batch)
        self._session.flush()
        return batch

    def get_by_id(self, batch_id: uuid.UUID) -> StudyGenerationBatch | None:
        """Find a generation batch by ID."""
        return self._session.get(StudyGenerationBatch, batch_id)

    def get_by_id_and_doc(
        self, batch_id: uuid.UUID, document_id: uuid.UUID
    ) -> StudyGenerationBatch | None:
        """Find a generation batch by ID scoped to document."""
        stmt = select(StudyGenerationBatch).where(
            StudyGenerationBatch.id == batch_id,
            StudyGenerationBatch.document_id == document_id,
        )
        return self._session.execute(stmt).scalars().first()

    def list_by_document(
        self,
        document_id: uuid.UUID,
        resource_type: str | None = None,
    ) -> list[StudyGenerationBatch]:
        """List generation batches for a document in descending chronological order."""
        stmt = (
            select(StudyGenerationBatch)
            .where(StudyGenerationBatch.document_id == document_id)
            .order_by(desc(StudyGenerationBatch.created_at))
        )
        if resource_type:
            stmt = stmt.where(StudyGenerationBatch.resource_type == resource_type)
        return list(self._session.execute(stmt).scalars())

    def mark_generating(self, batch_id: uuid.UUID) -> StudyGenerationBatch:
        """Mark batch status as GENERATING."""
        batch = self._session.get(StudyGenerationBatch, batch_id)
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        batch.status = BatchStatus.GENERATING.value
        batch.error_message = None
        self._session.flush()
        return batch

    def mark_completed(
        self,
        batch_id: uuid.UUID,
        resource_id: uuid.UUID,
        generated_count: int,
    ) -> StudyGenerationBatch:
        """Mark batch status as COMPLETED and link its generated StudyResource."""
        batch = self._session.get(StudyGenerationBatch, batch_id)
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        batch.status = BatchStatus.COMPLETED.value
        batch.resource_id = resource_id
        batch.generated_count = generated_count
        batch.completed_at = datetime.now()
        batch.error_message = None
        self._session.flush()
        return batch

    def mark_failed(
        self,
        batch_id: uuid.UUID,
        error_message: str,
    ) -> StudyGenerationBatch:
        """Mark batch status as FAILED with error message."""
        batch = self._session.get(StudyGenerationBatch, batch_id)
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        batch.status = BatchStatus.FAILED.value
        batch.error_message = error_message[:2048]
        self._session.flush()
        return batch

