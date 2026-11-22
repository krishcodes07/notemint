"""Tests for RAG index status and reindex API endpoints (Phase 10)."""

from __future__ import annotations

import uuid
from typing import Iterator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.main import app
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import DocumentExtraction, ExtractionStatus
from app.models.document_index import DocumentIndex, IndexStatus
from app.models.user import User
from app.schemas.auth import AuthenticatedUser


@pytest.fixture
def user_and_doc(db_session: Session) -> tuple[User, Document]:
    user = User(clerk_user_id="user_rag_api", email="ragapi@notemint.ai")
    db_session.add(user)
    db_session.commit()

    doc = Document(
        clerk_user_id=user.clerk_user_id,
        original_filename="Genetics_Notes.pdf",
        storage_key="test_genetics_notes.pdf",
        mime_type="application/pdf",
        file_size_bytes=10240,
        status=DocumentStatus.COMPLETED,
        page_count=3,
    )
    db_session.add(doc)
    db_session.commit()

    extraction = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=600,
        quality={"is_scanned": False},
    )
    db_session.add(extraction)
    db_session.commit()
    return user, doc


@pytest.fixture
def auth_client(client: TestClient, user_and_doc: tuple[User, Document]) -> Iterator[TestClient]:
    user, _ = user_and_doc
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user_id=user.clerk_user_id, claims={}
    )
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


class TestRagApiEndpoints:
    def test_get_index_status_unauthenticated_fails(self, client: TestClient, user_and_doc: tuple[User, Document]) -> None:
        _, doc = user_and_doc
        res = client.get(f"/api/v1/documents/{doc.id}/index-status")
        assert res.status_code == 401

    def test_get_index_status_pending_when_not_indexed(
        self, auth_client: TestClient, user_and_doc: tuple[User, Document]
    ) -> None:
        _, doc = user_and_doc
        res = auth_client.get(f"/api/v1/documents/{doc.id}/index-status")
        assert res.status_code == 200
        data = res.json()
        assert data["document_id"] == str(doc.id)
        assert data["status"] == "pending"
        assert data["chunk_count"] == 0
        assert data["embedding_dimensions"] == 384

    def test_get_index_status_completed(
        self, db_session: Session, auth_client: TestClient, user_and_doc: tuple[User, Document]
    ) -> None:
        _, doc = user_and_doc
        from app.repositories.document_index_repository import DocumentIndexRepository
        index_repo = DocumentIndexRepository(db_session)
        index_repo.mark_completed(doc.id, "local", "BAAI/bge-small-en-v1.5", 384, chunk_count=12)
        db_session.commit()

        res = auth_client.get(f"/api/v1/documents/{doc.id}/index-status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
        assert data["chunk_count"] == 12

    def test_reindex_document_enqueues_task(
        self, auth_client: TestClient, user_and_doc: tuple[User, Document], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _, doc = user_and_doc
        import app.tasks.document_indexing_tasks as task_module
        monkeypatch.setattr(task_module, "enqueue_indexing_task", lambda doc_id, force=True: True)

        res = auth_client.post(f"/api/v1/documents/{doc.id}/reindex")
        assert res.status_code == 200
        data = res.json()
        assert data["document_id"] == str(doc.id)
        assert data["enqueued"] is True
        assert "successfully enqueued" in data["message"].lower()

    def test_reindex_rejects_unextracted_document(
        self, db_session: Session, auth_client: TestClient, user_and_doc: tuple[User, Document]
    ) -> None:
        user, _ = user_and_doc

        doc_unextracted = Document(
            clerk_user_id=user.clerk_user_id,
            original_filename="Pending.pdf",
            storage_key="pending.pdf",
            mime_type="application/pdf",
            file_size_bytes=1000,
            status=DocumentStatus.UPLOADED,
        )
        db_session.add(doc_unextracted)
        db_session.commit()

        res = auth_client.post(f"/api/v1/documents/{doc_unextracted.id}/reindex")
        assert res.status_code == 400
        assert "extraction has not completed" in res.json()["detail"].lower()
