"""Database and repository tests for DocumentChunk and DocumentIndex (Phase 10)."""

from __future__ import annotations

import uuid
import pytest
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.document_chunk import DocumentChunk
from app.models.document_index import DocumentIndex, IndexStatus
from app.models.user import User
from app.repositories.document_chunk_repository import DocumentChunkRepository
from app.repositories.document_index_repository import DocumentIndexRepository


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_chunk_test", email="chunk@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def other_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_other_chunk", email="other_chunk@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_doc(db_session: Session, test_user: User) -> Document:
    doc = Document(
        clerk_user_id=test_user.clerk_user_id,
        original_filename="Botany_Textbook.pdf",
        storage_key="botany_storage_key_1.pdf",
        mime_type="application/pdf",
        file_size_bytes=20480,
        status=DocumentStatus.COMPLETED,
        page_count=12,
    )
    db_session.add(doc)
    db_session.commit()
    return doc


@pytest.fixture
def other_doc(db_session: Session, other_user: User) -> Document:
    doc = Document(
        clerk_user_id=other_user.clerk_user_id,
        original_filename="History_Textbook.pdf",
        storage_key="history_storage_key_2.pdf",
        mime_type="application/pdf",
        file_size_bytes=15360,
        status=DocumentStatus.COMPLETED,
        page_count=8,
    )
    db_session.add(doc)
    db_session.commit()
    return doc


class TestDocumentChunkRepository:
    def test_create_and_fetch_chunks(self, db_session: Session, test_doc: Document) -> None:
        repo = DocumentChunkRepository(db_session)

        dummy_vector = [0.05] * 384
        c1 = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=0,
            text="Passage 1 on plant tissues.",
            page_start=1,
            page_end=1,
            page_numbers=[1],
            token_count=15,
            content_hash="hash1",
            embedding=dummy_vector,
            embedding_model="BAAI/bge-small-en-v1.5",
        )
        c2 = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=1,
            text="Passage 2 on xylem and phloem.",
            page_start=2,
            page_end=2,
            page_numbers=[2],
            token_count=20,
            content_hash="hash2",
            embedding=dummy_vector,
            embedding_model="BAAI/bge-small-en-v1.5",
        )

        repo.create_chunks([c1, c2])
        db_session.commit()

        fetched = repo.get_chunks_for_document(test_doc.id)
        assert len(fetched) == 2
        assert fetched[0].chunk_index == 0
        assert fetched[1].chunk_index == 1
        assert fetched[0].text == "Passage 1 on plant tissues."

    def test_search_vector_similarity_and_document_isolation(
        self, db_session: Session, test_doc: Document, other_doc: Document
    ) -> None:
        repo = DocumentChunkRepository(db_session)

        # Chunks for test_doc (Botany)
        # Vector A: higher similarity to query
        vec_a = [1.0] + [0.0] * 383
        # Vector B: lower similarity to query
        vec_b = [0.0] + [1.0] + [0.0] * 382

        chunk_a = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=0,
            text="Botany chunk A",
            page_start=1,
            page_end=1,
            page_numbers=[1],
            token_count=10,
            content_hash="ha",
            embedding=vec_a,
            embedding_model="test",
        )
        chunk_b = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=1,
            text="Botany chunk B",
            page_start=2,
            page_end=2,
            page_numbers=[2],
            token_count=10,
            content_hash="hb",
            embedding=vec_b,
            embedding_model="test",
        )

        # Chunk for other_doc (History) - has identical vec_a!
        chunk_other = DocumentChunk(
            document_id=other_doc.id,
            chunk_index=0,
            text="History chunk Other",
            page_start=1,
            page_end=1,
            page_numbers=[1],
            token_count=10,
            content_hash="ho",
            embedding=vec_a,
            embedding_model="test",
        )

        repo.create_chunks([chunk_a, chunk_b, chunk_other])
        db_session.commit()

        # Query vector matching vec_a
        query_vec = [1.0] + [0.0] * 383
        results = repo.search_vector_similarity(test_doc.id, query_vec, top_k=5)

        assert len(results) == 2
        # Highest similarity is chunk_a (score 1.0)
        assert results[0][0].id == chunk_a.id
        assert results[0][1] > 0.99
        # Second is chunk_b (score 0.0)
        assert results[1][0].id == chunk_b.id

        # STRICT ISOLATION ASSERTION: other_doc's chunk must NEVER appear in test_doc's search
        result_ids = [r[0].id for r in results]
        assert chunk_other.id not in result_ids

    def test_delete_chunks_for_document(self, db_session: Session, test_doc: Document) -> None:
        repo = DocumentChunkRepository(db_session)
        c = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=0,
            text="To delete",
            page_start=1,
            page_end=1,
            page_numbers=[1],
            token_count=5,
            content_hash="hd",
            embedding=[0.1] * 384,
            embedding_model="test",
        )
        repo.create_chunks([c])
        db_session.commit()

        assert repo.get_chunk_count_for_document(test_doc.id) == 1
        deleted = repo.delete_chunks_for_document(test_doc.id)
        db_session.commit()

        assert deleted == 1
        assert repo.get_chunk_count_for_document(test_doc.id) == 0

    def test_cascade_delete_on_document_removal(self, db_session: Session, test_doc: Document) -> None:
        chunk_repo = DocumentChunkRepository(db_session)
        index_repo = DocumentIndexRepository(db_session)

        c = DocumentChunk(
            document_id=test_doc.id,
            chunk_index=0,
            text="Cascade test",
            page_start=1,
            page_end=1,
            page_numbers=[1],
            token_count=5,
            content_hash="hc",
            embedding=[0.1] * 384,
            embedding_model="test",
        )
        chunk_repo.create_chunks([c])
        index_repo.mark_completed(test_doc.id, "local", "model", 384, 1)
        db_session.commit()

        # Delete document
        db_session.delete(test_doc)
        db_session.commit()

        # Both chunks and index must be gone
        assert chunk_repo.get_chunk_count_for_document(test_doc.id) == 0
        assert index_repo.get_by_document_id(test_doc.id) is None


class TestDocumentIndexRepository:
    def test_index_lifecycle_transitions(self, db_session: Session, test_doc: Document) -> None:
        repo = DocumentIndexRepository(db_session)

        # 1. Initially None
        assert repo.get_by_document_id(test_doc.id) is None

        # 2. Mark indexing
        idx = repo.mark_indexing(test_doc.id, "local", "BAAI/bge-small-en-v1.5", 384)
        db_session.commit()
        assert idx.status == IndexStatus.INDEXING.value
        assert idx.embedding_dimensions == 384

        # 3. Mark completed
        completed = repo.mark_completed(test_doc.id, "local", "BAAI/bge-small-en-v1.5", 384, chunk_count=15)
        db_session.commit()
        assert completed.status == IndexStatus.COMPLETED.value
        assert completed.chunk_count == 15
        assert completed.indexed_at is not None

        # 4. Mark failed
        failed = repo.mark_failed(test_doc.id, "Model download timed out")
        db_session.commit()
        assert failed.status == IndexStatus.FAILED.value
        assert failed.error_message == "Model download timed out"

