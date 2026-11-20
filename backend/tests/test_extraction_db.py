"""Database tests for DocumentExtraction and DocumentPage persistence (Phase 6)."""

from __future__ import annotations

import uuid
from typing import Iterator

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.models.user import User
from app.repositories.extraction_repository import ExtractionRepository
from app.services.pdf_extraction_service import (
    ExtractionQuality,
    ExtractionResult,
    PageExtractionResult,
)


@pytest.fixture
def db_session() -> Iterator[Session]:
    """In-memory SQLite session with all models created."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def sample_document(db_session: Session) -> Document:
    """Fixture creating a user and document in the db_session."""
    user = User(clerk_user_id="user_test123")
    db_session.add(user)
    db_session.flush()

    doc = Document(
        id=uuid.uuid4(),
        clerk_user_id="user_test123",
        original_filename="sample-notes.pdf",
        storage_key="users/user_test123/documents/sample/original.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        status=DocumentStatus.UPLOADED,
    )
    db_session.add(doc)
    db_session.commit()
    return doc


class TestExtractionDatabasePersistence:
    def test_save_and_retrieve_extraction_results(
        self, db_session: Session, sample_document: Document
    ) -> None:
        repo = ExtractionRepository(db_session)
        result = ExtractionResult(
            metadata={"title": "Test Title", "page_count": 2},
            total_characters=150,
            page_count=2,
            pages=[
                PageExtractionResult(
                    page_number=1,
                    text="Page 1 text content",
                    character_count=19,
                    has_text=True,
                ),
                PageExtractionResult(
                    page_number=2,
                    text="Page 2 text content",
                    character_count=19,
                    has_text=True,
                ),
            ],
            quality=ExtractionQuality(
                is_scanned=False,
                ocr_required=False,
                empty_pages=[],
                low_text_pages=[],
                extraction_success=True,
            ),
        )

        extraction = repo.save_extraction_results(
            document_id=sample_document.id,
            result=result,
            status=ExtractionStatus.COMPLETED,
        )
        db_session.commit()

        # Check extraction record
        loaded_extraction = repo.get_by_document_id(sample_document.id)
        assert loaded_extraction is not None
        assert loaded_extraction.status == ExtractionStatus.COMPLETED
        assert loaded_extraction.total_characters == 150
        assert loaded_extraction.doc_metadata == {"title": "Test Title", "page_count": 2}

        # Check pages
        pages = repo.get_pages_for_document(sample_document.id)
        assert len(pages) == 2
        assert pages[0].page_number == 1
        assert pages[0].text == "Page 1 text content"
        assert pages[1].page_number == 2

        # Check document status and page count update
        doc = db_session.get(Document, sample_document.id)
        assert doc is not None
        assert doc.status == DocumentStatus.COMPLETED
        assert doc.page_count == 2

    def test_unique_constraint_on_document_page_number(
        self, db_session: Session, sample_document: Document
    ) -> None:
        p1 = DocumentPage(
            id=uuid.uuid4(),
            document_id=sample_document.id,
            page_number=1,
            text="First version of page 1",
            character_count=23,
            has_text=True,
        )
        p2 = DocumentPage(
            id=uuid.uuid4(),
            document_id=sample_document.id,
            page_number=1,  # Duplicate page_number for same document
            text="Second version of page 1",
            character_count=24,
            has_text=True,
        )
        db_session.add(p1)
        db_session.commit()

        db_session.add(p2)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_idempotent_reprocessing_without_duplicate_pages(
        self, db_session: Session, sample_document: Document
    ) -> None:
        repo = ExtractionRepository(db_session)
        result1 = ExtractionResult(
            metadata={"title": "Run 1"},
            total_characters=100,
            page_count=2,
            pages=[
                PageExtractionResult(page_number=1, text="Old P1", character_count=6, has_text=True),
                PageExtractionResult(page_number=2, text="Old P2", character_count=6, has_text=True),
            ],
            quality=ExtractionQuality(
                is_scanned=False, ocr_required=False, empty_pages=[], low_text_pages=[], extraction_success=True
            ),
        )
        repo.save_extraction_results(sample_document.id, result1, ExtractionStatus.COMPLETED)
        db_session.commit()

        assert len(repo.get_pages_for_document(sample_document.id)) == 2

        # Simulate second / retried extraction run
        result2 = ExtractionResult(
            metadata={"title": "Run 2"},
            total_characters=120,
            page_count=2,
            pages=[
                PageExtractionResult(page_number=1, text="New P1 text", character_count=11, has_text=True),
                PageExtractionResult(page_number=2, text="New P2 text", character_count=11, has_text=True),
            ],
            quality=ExtractionQuality(
                is_scanned=False, ocr_required=False, empty_pages=[], low_text_pages=[], extraction_success=True
            ),
        )
        repo.save_extraction_results(sample_document.id, result2, ExtractionStatus.COMPLETED)
        db_session.commit()

        # Must still have exactly 2 pages, with updated text!
        pages = repo.get_pages_for_document(sample_document.id)
        assert len(pages) == 2
        assert pages[0].text == "New P1 text"
        assert pages[1].text == "New P2 text"

    def test_cascade_delete_cleans_up_extractions_and_pages(
        self, db_session: Session, sample_document: Document
    ) -> None:
        repo = ExtractionRepository(db_session)
        result = ExtractionResult(
            metadata={},
            total_characters=50,
            page_count=1,
            pages=[PageExtractionResult(page_number=1, text="Text", character_count=4, has_text=True)],
            quality=ExtractionQuality(
                is_scanned=False, ocr_required=False, empty_pages=[], low_text_pages=[], extraction_success=True
            ),
        )
        repo.save_extraction_results(sample_document.id, result, ExtractionStatus.COMPLETED)
        db_session.commit()

        # Verify rows exist
        assert repo.get_by_document_id(sample_document.id) is not None
        assert len(repo.get_pages_for_document(sample_document.id)) == 1

        # Delete document
        db_session.delete(sample_document)
        db_session.commit()

        # Verify extraction and pages are automatically deleted by CASCADE
        assert repo.get_by_document_id(sample_document.id) is None
        assert len(repo.get_pages_for_document(sample_document.id)) == 0

    def test_status_transitions(self, db_session: Session, sample_document: Document) -> None:
        repo = ExtractionRepository(db_session)

        # 1. Start extracting
        repo.mark_extracting(sample_document.id)
        db_session.commit()
        doc = db_session.get(Document, sample_document.id)
        assert doc is not None and doc.status == DocumentStatus.EXTRACTING

        # 2. Mark failed
        repo.mark_failed(sample_document.id, "Extraction failure test")
        db_session.commit()
        doc = db_session.get(Document, sample_document.id)
        assert doc is not None and doc.status == DocumentStatus.FAILED
        ext = repo.get_by_document_id(sample_document.id)
        assert ext is not None and ext.status == ExtractionStatus.FAILED
        assert ext.error_message == "Extraction failure test"

