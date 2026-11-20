"""API tests for document extraction status and reprocess endpoints (Phase 6)."""

from __future__ import annotations

import io
import uuid
from typing import Any, Iterator
from unittest.mock import patch

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.models.document import DocumentStatus
from app.models.document_extraction import ExtractionStatus
from app.repositories.extraction_repository import ExtractionRepository
from app.services.pdf_extraction_service import (
    ExtractionQuality,
    ExtractionResult,
    PageExtractionResult,
)
from app.services.storage_service import StorageService, get_storage_service
from tests.conftest import auth_header, make_token


class InMemoryStorageService(StorageService):
    def __init__(self) -> None:
        super().__init__()
        self.objects: dict[str, tuple[bytes, str]] = {}

    def upload_fileobj(
        self,
        key: str,
        fileobj: Any,
        *,
        content_type: str = "application/pdf",
        length: int | None = None,
    ) -> None:
        data = fileobj.read()
        self.objects[key] = (data, content_type)

    def delete(self, key: str) -> bool:
        if key in self.objects:
            del self.objects[key]
            return True
        return False


@pytest.fixture
def fake_storage() -> InMemoryStorageService:
    return InMemoryStorageService()


@pytest.fixture
def api_client(client: TestClient, fake_storage: InMemoryStorageService) -> Any:
    from app.main import app

    app.dependency_overrides[get_storage_service] = lambda: fake_storage
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_storage_service, None)


def _upload_test_document(client: TestClient, token: str) -> str:
    """Helper to upload a minimal valid PDF and return the document ID."""
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Sample biology content for extraction.")
    pdf_bytes = doc.tobytes()
    doc.close()

    resp = client.post(
        "/api/v1/documents",
        headers=auth_header(token),
        files={"file": ("notes.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestExtractionStatusApi:
    def test_unauthenticated_request_rejected(self, api_client: TestClient) -> None:
        random_id = uuid.uuid4()
        resp = api_client.get(f"/api/v1/documents/{random_id}/extraction")
        assert resp.status_code == 401

    def test_nonexistent_document_returns_404(
        self,
        api_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student1")
        random_id = uuid.uuid4()

        resp = api_client.get(
            f"/api/v1/documents/{random_id}/extraction",
            headers=auth_header(token),
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Document not found"

    def test_user_cannot_access_other_users_extraction_status(
        self,
        api_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token_owner = make_token(private_key, sub="user_owner1")
        token_other = make_token(private_key, sub="user_intruder2")

        doc_id = _upload_test_document(api_client, token_owner)

        # Owner can access
        resp_owner = api_client.get(
            f"/api/v1/documents/{doc_id}/extraction",
            headers=auth_header(token_owner),
        )
        assert resp_owner.status_code == 200

        # Other user is denied with 404
        resp_other = api_client.get(
            f"/api/v1/documents/{doc_id}/extraction",
            headers=auth_header(token_other),
        )
        assert resp_other.status_code == 404
        assert resp_other.json()["detail"] == "Document not found"

    def test_extraction_status_before_and_after_processing(
        self,
        api_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
        db_sessionmaker: Any,
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student2")
        doc_id = _upload_test_document(api_client, token)

        # 1. Before worker processing: status is uploaded, extraction is null
        resp = api_client.get(
            f"/api/v1/documents/{doc_id}/extraction",
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == doc_id
        assert data["document_status"] == "uploaded"
        assert data["extraction_status"] is None
        assert data["page_count"] is None
        assert data["total_characters"] == 0
        assert data["is_scanned"] is False

        # 2. Simulate worker completing extraction
        with db_sessionmaker() as session:
            repo = ExtractionRepository(session)
            result = ExtractionResult(
                metadata={"title": "Test Title", "page_count": 1},
                total_characters=120,
                page_count=1,
                pages=[
                    PageExtractionResult(
                        page_number=1,
                        text="Extracted text",
                        character_count=14,
                        has_text=True,
                    )
                ],
                quality=ExtractionQuality(
                    is_scanned=False,
                    ocr_required=False,
                    empty_pages=[],
                    low_text_pages=[],
                    extraction_success=True,
                ),
            )
            repo.save_extraction_results(
                uuid.UUID(doc_id), result, ExtractionStatus.COMPLETED
            )
            session.commit()

        # 3. Fetch status again: now completed
        resp_after = api_client.get(
            f"/api/v1/documents/{doc_id}/extraction",
            headers=auth_header(token),
        )
        assert resp_after.status_code == 200
        data_after = resp_after.json()
        assert data_after["document_status"] == "completed"
        assert data_after["extraction_status"] == "completed"
        assert data_after["page_count"] == 1
        assert data_after["total_characters"] == 120
        assert data_after["quality"]["extraction_success"] is True


class TestReprocessApi:
    def test_reprocess_unauthenticated_rejected(self, api_client: TestClient) -> None:
        random_id = uuid.uuid4()
        resp = api_client.post(f"/api/v1/documents/{random_id}/reprocess")
        assert resp.status_code == 401

    def test_reprocess_other_users_document_rejected(
        self,
        api_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token_owner = make_token(private_key, sub="user_ownerreprocess")
        token_intruder = make_token(private_key, sub="user_intruderreprocess")

        doc_id = _upload_test_document(api_client, token_owner)

        resp = api_client.post(
            f"/api/v1/documents/{doc_id}/reprocess",
            headers=auth_header(token_intruder),
        )
        assert resp.status_code == 404

    def test_reprocess_success_resets_status(
        self,
        api_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_reprocesssuccess")
        doc_id = _upload_test_document(api_client, token)

        with patch("app.services.document_service.enqueue_extraction_task", return_value=True):
            resp = api_client.post(
                f"/api/v1/documents/{doc_id}/reprocess",
                headers=auth_header(token),
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == doc_id
        assert data["document_status"] == "uploaded"
        assert data["enqueued"] is True
