"""Tests for DocumentContextService preparation and chunking."""

from __future__ import annotations

import uuid
from typing import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.models.user import User
from app.services.document_context_service import (
    DocumentContextService,
    EmptyDocumentContextError,
    ExtractionNotCompletedError,
    estimate_tokens,
)


@pytest.fixture
def db_session() -> Iterator[Session]:
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
def doc_with_pages(db_session: Session) -> Document:
    user = User(clerk_user_id="user_context_test")
    db_session.add(user)
    db_session.flush()

    doc = Document(
        id=uuid.uuid4(),
        clerk_user_id="user_context_test",
        original_filename="chapter1.pdf",
        storage_key="users/user_context_test/docs/ch1.pdf",
        mime_type="application/pdf",
        file_size_bytes=2048,
        status=DocumentStatus.COMPLETED,
    )
    db_session.add(doc)

    ext = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=500,
    )
    db_session.add(ext)

    # Add 3 pages
    for p_num in range(1, 4):
        page = DocumentPage(
            document_id=doc.id,
            page_number=p_num,
            text=f"This is the content of page {p_num} explaining key biological concepts.",
            character_count=60,
            has_text=True,
        )
        db_session.add(page)

    db_session.commit()
    return doc


class TestDocumentContextService:
    def test_estimate_tokens_heuristic(self) -> None:
        assert estimate_tokens("") == 0
        assert estimate_tokens("hello world") == 2
        assert estimate_tokens("a" * 100) == 25

    def test_extraction_not_completed_raises_error(self, db_session: Session) -> None:
        doc = Document(
            id=uuid.uuid4(),
            clerk_user_id="user_x",
            original_filename="incomplete.pdf",
            storage_key="k1",
            mime_type="application/pdf",
            file_size_bytes=100,
            status=DocumentStatus.EXTRACTING,
        )
        db_session.add(doc)
        ext = DocumentExtraction(
            document_id=doc.id,
            status=ExtractionStatus.EXTRACTING,
        )
        db_session.add(ext)
        db_session.commit()

        service = DocumentContextService(db_session)
        with pytest.raises(ExtractionNotCompletedError, match="extraction is not completed"):
            service.prepare_context(doc.id)

    def test_empty_document_raises_error(self, db_session: Session) -> None:
        doc = Document(
            id=uuid.uuid4(),
            clerk_user_id="user_x",
            original_filename="empty.pdf",
            storage_key="k2",
            mime_type="application/pdf",
            file_size_bytes=100,
            status=DocumentStatus.COMPLETED,
        )
        db_session.add(doc)
        ext = DocumentExtraction(
            document_id=doc.id,
            status=ExtractionStatus.COMPLETED,
            total_characters=0,
        )
        db_session.add(ext)
        db_session.commit()

        service = DocumentContextService(db_session)
        with pytest.raises(EmptyDocumentContextError):
            service.prepare_context(doc.id)

    def test_single_context_prepared_successfully(
        self, db_session: Session, doc_with_pages: Document
    ) -> None:
        service = DocumentContextService(db_session, default_max_context_tokens=10000)
        context = service.prepare_context(doc_with_pages.id)

        assert context.document_id == doc_with_pages.id
        assert context.total_pages == 3
        assert context.valid_page_count == 3
        assert context.min_page == 1
        assert context.max_page == 3
        assert not context.is_multi_chunk
        assert "[Page 1]" in context.formatted_text
        assert "[Page 2]" in context.formatted_text
        assert "[Page 3]" in context.formatted_text
        assert len(context.chunks) == 1

    def test_multi_chunk_partitioning_for_long_content(
        self, db_session: Session
    ) -> None:
        # Create a document with many large pages
        user = User(clerk_user_id="user_long")
        db_session.add(user)
        db_session.flush()

        doc = Document(
            id=uuid.uuid4(),
            clerk_user_id="user_long",
            original_filename="long-book.pdf",
            storage_key="k3",
            mime_type="application/pdf",
            file_size_bytes=100000,
            status=DocumentStatus.COMPLETED,
        )
        db_session.add(doc)
        ext = DocumentExtraction(
            document_id=doc.id,
            status=ExtractionStatus.COMPLETED,
            total_characters=10000,
        )
        db_session.add(ext)

        # 10 pages with ~400 chars each (~100 tokens per page)
        for p in range(1, 11):
            page = DocumentPage(
                document_id=doc.id,
                page_number=p,
                text=("Chapter discussion text. " * 15) + f" Page {p}.",
                character_count=400,
                has_text=True,
            )
            db_session.add(page)
        db_session.commit()

        # Set max_context_tokens low (e.g. 250 tokens) to force chunking
        service = DocumentContextService(db_session, default_max_context_tokens=250)
        context = service.prepare_context(doc.id, max_context_tokens=250)

        assert context.is_multi_chunk is True
        assert len(context.chunks) > 1
        # Check that page ranges are tracked
        assert context.chunks[0].start_page == 1
        assert context.chunks[-1].end_page == 10

