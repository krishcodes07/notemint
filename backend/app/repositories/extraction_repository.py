"""Extraction repository: data-access operations for PDF text extraction and pages."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.services.pdf_extraction_service import ExtractionResult

logger = logging.getLogger(__name__)


class ExtractionRepository:
    """Data-access operations for `document_extractions` and `document_pages` tables."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_document_id(self, document_id: uuid.UUID) -> DocumentExtraction | None:
        """Find the extraction record for a document."""
        statement = select(DocumentExtraction).where(
            DocumentExtraction.document_id == document_id
        )
        return self._session.execute(statement).scalar_one_or_none()

    def get_pages_for_document(self, document_id: uuid.UUID) -> list[DocumentPage]:
        """Return all extracted pages for a document ordered by page number."""
        statement = (
            select(DocumentPage)
            .where(DocumentPage.document_id == document_id)
            .order_by(DocumentPage.page_number.asc())
        )
        return list(self._session.execute(statement).scalars())

    def get_page(
        self, document_id: uuid.UUID, page_number: int
    ) -> DocumentPage | None:
        """Find a specific extracted page by document ID and page number."""
        statement = select(DocumentPage).where(
            DocumentPage.document_id == document_id,
            DocumentPage.page_number == page_number,
        )
        return self._session.execute(statement).scalar_one_or_none()

    def mark_extracting(self, document_id: uuid.UUID) -> DocumentExtraction:
        """Set document and extraction status to EXTRACTING."""
        doc = self._session.get(Document, document_id)
        if doc:
            doc.status = DocumentStatus.EXTRACTING

        extraction = self.get_by_document_id(document_id)
        if extraction is None:
            extraction = DocumentExtraction(
                document_id=document_id,
                status=ExtractionStatus.EXTRACTING,
            )
            self._session.add(extraction)
        else:
            extraction.status = ExtractionStatus.EXTRACTING
            extraction.error_message = None

        self._session.flush()
        return extraction

    def mark_failed(
        self,
        document_id: uuid.UUID,
        error_message: str,
        quality: dict[str, Any] | None = None,
    ) -> DocumentExtraction:
        """Set document and extraction status to FAILED with sanitized error info."""
        doc = self._session.get(Document, document_id)
        if doc:
            doc.status = DocumentStatus.FAILED

        extraction = self.get_by_document_id(document_id)
        if extraction is None:
            extraction = DocumentExtraction(
                document_id=document_id,
                status=ExtractionStatus.FAILED,
                error_message=error_message[:1024],
                quality=quality,
            )
            self._session.add(extraction)
        else:
            extraction.status = ExtractionStatus.FAILED
            extraction.error_message = error_message[:1024]
            if quality:
                extraction.quality = quality

        self._session.flush()
        return extraction

    def save_extraction_results(
        self,
        document_id: uuid.UUID,
        result: ExtractionResult,
        status: ExtractionStatus = ExtractionStatus.COMPLETED,
        error_message: str | None = None,
    ) -> DocumentExtraction:
        """Persist extraction results and pages idempotently within a transaction.

        If previous pages or an extraction row exist (e.g. from a retried task),
        old pages are safely replaced and the extraction row is updated.
        """
        doc = self._session.get(Document, document_id)
        if doc:
            doc.page_count = result.page_count
            if status == ExtractionStatus.COMPLETED:
                doc.status = DocumentStatus.COMPLETED
            elif status == ExtractionStatus.FAILED:
                doc.status = DocumentStatus.FAILED

        # 1. Upsert DocumentExtraction record
        extraction = self.get_by_document_id(document_id)
        quality_dict = result.quality.to_dict()

        if extraction is None:
            extraction = DocumentExtraction(
                document_id=document_id,
                doc_metadata=result.metadata,
                total_characters=result.total_characters,
                status=status,
                engine=result.engine,
                quality=quality_dict,
                error_message=error_message[:1024] if error_message else None,
            )
            self._session.add(extraction)
        else:
            extraction.doc_metadata = result.metadata
            extraction.total_characters = result.total_characters
            extraction.status = status
            extraction.engine = result.engine
            extraction.quality = quality_dict
            extraction.error_message = (
                error_message[:1024] if error_message else None
            )

        # 2. Delete any existing pages for idempotency
        self._session.execute(
            delete(DocumentPage).where(DocumentPage.document_id == document_id)
        )

        # 3. Insert page records
        page_records = [
            DocumentPage(
                id=uuid.uuid4(),
                document_id=document_id,
                page_number=page.page_number,
                text=page.text,
                character_count=page.character_count,
                has_text=page.has_text,
            )
            for page in result.pages
        ]
        self._session.add_all(page_records)
        self._session.flush()

        return extraction

