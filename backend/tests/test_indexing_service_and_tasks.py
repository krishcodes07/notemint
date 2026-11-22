"""Tests for DocumentIndexingService, Celery tasks, and CLI backfill (Phase 10)."""

from __future__ import annotations

import uuid
import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.cli import backfill_document_indexes
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import DocumentExtraction, DocumentPage, ExtractionStatus
from app.models.document_index import DocumentIndex, IndexStatus
from app.models.user import User
from app.repositories.document_chunk_repository import DocumentChunkRepository
from app.repositories.document_index_repository import DocumentIndexRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.services.document_indexing_service import DocumentIndexingError, DocumentIndexingService
from app.tasks.document_indexing_tasks import enqueue_indexing_task, index_document_embeddings_task


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_indexing_test", email="indexing@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def extracted_doc(db_session: Session, test_user: User) -> Document:
    doc = Document(
        clerk_user_id=test_user.clerk_user_id,
        original_filename="Photosynthesis_Chapter.pdf",
        storage_key="test_storage_key_indexing.pdf",
        mime_type="application/pdf",
        file_size_bytes=10240,
        status=DocumentStatus.COMPLETED,
        page_count=2,
    )
    db_session.add(doc)
    db_session.commit()

    extraction = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=300,
        quality={"is_scanned": False},
    )
    db_session.add(extraction)

    p1 = DocumentPage(
        document_id=doc.id,
        page_number=1,
        text="Photosynthesis is the process in green plants that uses sunlight to synthesize nutrients.",
        character_count=87,
        has_text=True,
    )
    p2 = DocumentPage(
        document_id=doc.id,
        page_number=2,
        text="Cellular respiration in mitochondria produces ATP as the energy currency of cells.",
        character_count=83,
        has_text=True,
    )
    db_session.add_all([p1, p2])
    db_session.commit()
    return doc


class TestDocumentIndexingService:
    def test_successful_indexing_workflow(self, db_session: Session, extracted_doc: Document) -> None:
        service = DocumentIndexingService(db_session)
        index_record = service.index_document(extracted_doc.id)

        assert index_record.status == IndexStatus.COMPLETED.value
        assert index_record.chunk_count >= 1
        assert index_record.embedding_model == "BAAI/bge-small-en-v1.5"
        assert index_record.embedding_dimensions == 384
        assert index_record.indexed_at is not None

        chunk_repo = DocumentChunkRepository(db_session)
        chunks = chunk_repo.get_chunks_for_document(extracted_doc.id)
        assert len(chunks) == index_record.chunk_count
        assert chunks[0].embedding is not None
        assert len(chunks[0].embedding) == 384

    def test_skips_when_already_indexed(self, db_session: Session, extracted_doc: Document) -> None:
        service = DocumentIndexingService(db_session)
        idx1 = service.index_document(extracted_doc.id)

        # Second call without force should skip re-chunking
        idx2 = service.index_document(extracted_doc.id, force=False)
        assert idx1.id == idx2.id
        assert idx2.status == IndexStatus.COMPLETED.value

    def test_force_reindexing_replaces_chunks(self, db_session: Session, extracted_doc: Document) -> None:
        service = DocumentIndexingService(db_session)
        idx1 = service.index_document(extracted_doc.id)
        assert idx1.status == IndexStatus.COMPLETED.value

        # Force reindex
        idx2 = service.index_document(extracted_doc.id, force=True)
        assert idx2.status == IndexStatus.COMPLETED.value
        chunk_repo = DocumentChunkRepository(db_session)
        assert chunk_repo.get_chunk_count_for_document(extracted_doc.id) == idx2.chunk_count

    def test_fails_when_extraction_not_completed(self, db_session: Session, test_user: User) -> None:
        unextracted_doc = Document(
            clerk_user_id=test_user.clerk_user_id,
            original_filename="Unextracted.pdf",
            storage_key="unextracted.pdf",
            mime_type="application/pdf",
            file_size_bytes=5000,
            status=DocumentStatus.UPLOADED,
        )
        db_session.add(unextracted_doc)
        db_session.commit()

        service = DocumentIndexingService(db_session)
        with pytest.raises(DocumentIndexingError, match="extraction status"):
            service.index_document(unextracted_doc.id)


class TestIndexingTasksAndCLI:
    def test_index_document_embeddings_task(
        self, db_sessionmaker: sessionmaker[Session], extracted_doc: Document, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.tasks.document_indexing_tasks as task_module
        monkeypatch.setattr(task_module, "get_session_factory", lambda: db_sessionmaker)

        res = index_document_embeddings_task(str(extracted_doc.id), force=True)
        assert res["status"] == IndexStatus.COMPLETED.value
        assert res["chunk_count"] >= 1

    def test_enqueue_indexing_task_eager(
        self, db_sessionmaker: sessionmaker[Session], extracted_doc: Document, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.tasks.document_indexing_tasks as task_module
        from app.core.celery_app import celery_app
        monkeypatch.setattr(task_module, "get_session_factory", lambda: db_sessionmaker)

        orig_eager = celery_app.conf.task_always_eager
        celery_app.conf.task_always_eager = True
        try:
            enqueued = enqueue_indexing_task(extracted_doc.id)
            assert enqueued is True
        finally:
            celery_app.conf.task_always_eager = orig_eager

    def test_cli_backfill(
        self, db_sessionmaker: sessionmaker[Session], extracted_doc: Document, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import app.cli as cli_module
        monkeypatch.setattr(cli_module, "get_session_factory", lambda: db_sessionmaker)
        monkeypatch.setattr(cli_module, "enqueue_indexing_task", lambda doc_id, force=False: True)

        queued = backfill_document_indexes(limit=10, force=True)
        assert queued >= 1
