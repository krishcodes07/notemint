"""Tests for Phase 5 Document Upload and Management System."""

from __future__ import annotations

import io
import uuid
from typing import Any, Iterator
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.integrations.neon_storage import (
    StorageObjectNotFoundError,
    StorageUnavailableError,
)
from app.models.document import DocumentStatus
from app.services.document_service import (
    DocumentNotFoundError,
    DocumentService,
    FileTooLargeError,
    InvalidPDFError,
    sanitize_filename,
)
from app.services.storage_service import StorageService, get_storage_service
from tests.conftest import auth_header, make_token


class InMemoryStorageService(StorageService):
    """In-memory storage service simulation for reliable tests without AWS/Neon."""

    def __init__(self) -> None:
        super().__init__()
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.should_fail_upload = False
        self.should_fail_delete = False
        self.deleted_keys: list[str] = []

    def upload_fileobj(
        self,
        key: str,
        fileobj: Any,
        *,
        content_type: str = "application/pdf",
        length: int | None = None,
    ) -> None:
        if self.should_fail_upload:
            raise StorageUnavailableError("Simulated storage upload failure")
        data = fileobj.read()
        self.objects[key] = (data, content_type)

    def get_object_stream(
        self,
        key: str,
        *,
        chunk_size: int = 64 * 1024,
    ) -> tuple[Iterator[bytes], int | None, str | None]:
        if key not in self.objects:
            raise StorageObjectNotFoundError(key)
        data, content_type = self.objects[key]

        def _stream() -> Iterator[bytes]:
            yield data

        return _stream(), len(data), content_type

    def delete(self, key: str) -> bool:
        if self.should_fail_delete:
            raise StorageUnavailableError("Simulated storage delete failure")
        self.deleted_keys.append(key)
        if key in self.objects:
            del self.objects[key]
            return True
        return False

    def exists(self, key: str) -> bool:
        return key in self.objects


@pytest.fixture
def fake_storage() -> InMemoryStorageService:
    return InMemoryStorageService()


@pytest.fixture
def document_client(client: TestClient, fake_storage: InMemoryStorageService) -> Any:
    """TestClient with get_storage_service overridden to use fake_storage."""
    from app.main import app

    app.dependency_overrides[get_storage_service] = lambda: fake_storage
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_storage_service, None)


def _valid_pdf_content() -> bytes:
    """Minimal valid PDF byte sequence starting with %PDF-."""
    return b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"


# ---------------------------------------------------------------------------
# Unit tests: Filename sanitization
# ---------------------------------------------------------------------------


class TestSanitizeFilename:
    def test_clean_standard_filename(self) -> None:
        assert sanitize_filename("chapter1.pdf") == "chapter1.pdf"

    def test_strip_path_traversal(self) -> None:
        assert sanitize_filename("../../etc/passwd.pdf") == "passwd.pdf"
        assert sanitize_filename("..\\..\\windows\\system32\\calc.pdf") == "calc.pdf"

    def test_strip_control_characters(self) -> None:
        cleaned = sanitize_filename("my\x00file\nname.pdf")
        assert "\x00" not in cleaned
        assert "\n" not in cleaned
        assert cleaned.endswith(".pdf")

    def test_empty_or_none_fallback(self) -> None:
        assert sanitize_filename(None) == "document.pdf"
        assert sanitize_filename("") == "document.pdf"
        assert sanitize_filename("   ") == "document.pdf"


# ---------------------------------------------------------------------------
# API tests: Authentication checks
# ---------------------------------------------------------------------------


class TestDocumentAuth:
    def test_upload_without_token_returns_401(self, document_client: TestClient) -> None:
        resp = document_client.post(
            "/api/v1/documents",
            files={"file": ("test.pdf", _valid_pdf_content(), "application/pdf")},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Not authenticated"

    def test_list_without_token_returns_401(self, document_client: TestClient) -> None:
        resp = document_client.get("/api/v1/documents")
        assert resp.status_code == 401

    def test_get_without_token_returns_401(self, document_client: TestClient) -> None:
        resp = document_client.get(f"/api/v1/documents/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_delete_without_token_returns_401(self, document_client: TestClient) -> None:
        resp = document_client.delete(f"/api/v1/documents/{uuid.uuid4()}")
        assert resp.status_code == 401

    def test_download_without_token_returns_401(self, document_client: TestClient) -> None:
        resp = document_client.get(f"/api/v1/documents/{uuid.uuid4()}/file")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# API tests: Upload Validation
# ---------------------------------------------------------------------------


class TestUploadValidation:
    def test_successful_upload(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
        fake_storage: InMemoryStorageService,
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        content = _valid_pdf_content()
        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("biology-notes.pdf", content, "application/pdf")},
        )
        assert resp.status_code == 201
        data = resp.json()

        assert "id" in data
        assert data["original_filename"] == "biology-notes.pdf"
        assert data["mime_type"] == "application/pdf"
        assert data["file_size_bytes"] == len(content)
        assert data["status"] == "uploaded"
        assert data["page_count"] is None
        assert "created_at" in data

        # Check storage keys are NOT exposed
        assert "storage_key" not in data
        assert "bucket" not in data

        # Verify object was saved in fake storage
        assert len(fake_storage.objects) == 1

    def test_reject_wrong_extension(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("malicious.exe", _valid_pdf_content(), "application/pdf")},
        )
        assert resp.status_code == 415
        assert "extension must be .pdf" in resp.json()["detail"].lower()

    def test_reject_wrong_mime_type(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("test.pdf", _valid_pdf_content(), "text/plain")},
        )
        assert resp.status_code == 415
        assert "mime type" in resp.json()["detail"].lower()

    def test_reject_renamed_non_pdf_file(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        # Fake PDF: correct extension and MIME type, but binary content is not PDF
        fake_content = b"PK\x03\x04This is a zip file disguised as pdf"
        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("fake.pdf", fake_content, "application/pdf")},
        )
        assert resp.status_code == 415
        assert "pdf signature" in resp.json()["detail"].lower()

    def test_reject_empty_file(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("empty.pdf", b"", "application/pdf")},
        )
        assert resp.status_code == 415

    def test_reject_oversized_file(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from app.core.config import settings

        # Temporarily set max upload to 1 MB for testing
        monkeypatch.setattr(settings, "max_upload_size_mb", 1)

        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        # Create oversized content (1MB + 100 bytes) starting with valid header
        oversized = b"%PDF-" + b"0" * (1024 * 1024 + 100)
        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("large.pdf", oversized, "application/pdf")},
        )
        assert resp.status_code == 413
        assert "exceeds maximum allowed size" in resp.json()["detail"].lower()

    def test_path_traversal_in_filename_is_neutralized(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_student123")

        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("../../../secret_doc.pdf", _valid_pdf_content(), "application/pdf")},
        )
        assert resp.status_code == 201
        assert resp.json()["original_filename"] == "secret_doc.pdf"


# ---------------------------------------------------------------------------
# API tests: Document Ownership Isolation
# ---------------------------------------------------------------------------


class TestDocumentOwnership:
    def test_users_cannot_see_each_others_documents(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token_alice = make_token(private_key, sub="user_alice")
        token_bob = make_token(private_key, sub="user_bob")

        # Alice uploads a document
        resp_upload = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token_alice),
            files={"file": ("alice-notes.pdf", _valid_pdf_content(), "application/pdf")},
        )
        assert resp_upload.status_code == 201
        alice_doc_id = resp_upload.json()["id"]

        # Alice lists documents -> sees 1 item
        resp_alice_list = document_client.get(
            "/api/v1/documents",
            headers=auth_header(token_alice),
        )
        assert resp_alice_list.status_code == 200
        assert resp_alice_list.json()["total"] == 1
        assert resp_alice_list.json()["items"][0]["id"] == alice_doc_id

        # Bob lists documents -> sees 0 items
        resp_bob_list = document_client.get(
            "/api/v1/documents",
            headers=auth_header(token_bob),
        )
        assert resp_bob_list.status_code == 200
        assert resp_bob_list.json()["total"] == 0
        assert len(resp_bob_list.json()["items"]) == 0

        # Bob attempts to get Alice's document -> 404
        resp_bob_get = document_client.get(
            f"/api/v1/documents/{alice_doc_id}",
            headers=auth_header(token_bob),
        )
        assert resp_bob_get.status_code == 404
        assert resp_bob_get.json()["detail"] == "Document not found"

        # Bob attempts to download Alice's document file -> 404
        resp_bob_download = document_client.get(
            f"/api/v1/documents/{alice_doc_id}/file",
            headers=auth_header(token_bob),
        )
        assert resp_bob_download.status_code == 404

        # Bob attempts to delete Alice's document -> 404
        resp_bob_delete = document_client.delete(
            f"/api/v1/documents/{alice_doc_id}",
            headers=auth_header(token_bob),
        )
        assert resp_bob_delete.status_code == 404

        # Alice retrieves and downloads her own document -> 200
        resp_alice_get = document_client.get(
            f"/api/v1/documents/{alice_doc_id}",
            headers=auth_header(token_alice),
        )
        assert resp_alice_get.status_code == 200
        assert resp_alice_get.json()["id"] == alice_doc_id

        resp_alice_download = document_client.get(
            f"/api/v1/documents/{alice_doc_id}/file",
            headers=auth_header(token_alice),
        )
        assert resp_alice_download.status_code == 200
        assert resp_alice_download.content == _valid_pdf_content()
        assert "inline" in resp_alice_download.headers["Content-Disposition"]
        assert resp_alice_download.headers["Content-Type"] == "application/pdf"


# ---------------------------------------------------------------------------
# API tests: Storage & Consistency Failure Handling
# ---------------------------------------------------------------------------


class TestStorageAndConsistency:
    def test_storage_failure_during_upload_returns_503(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
        fake_storage: InMemoryStorageService,
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_charlie")
        fake_storage.should_fail_upload = True

        resp = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("notes.pdf", _valid_pdf_content(), "application/pdf")},
        )
        assert resp.status_code == 503
        assert "storage service unavailable" in resp.json()["detail"].lower()

    def test_database_failure_cleans_up_storage_object(
        self,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
        fake_storage: InMemoryStorageService,
        db_session: Any,
    ) -> None:
        """When DB persistence fails, the uploaded object in S3 must be cleaned up."""
        service = DocumentService(session=db_session, storage_service=fake_storage)

        # Mock db_repo.create to raise an error
        with patch.object(service._doc_repo, "create", side_effect=Exception("DB connection dropped")):
            content = _valid_pdf_content()
            upload_file = MagicMock()
            upload_file.filename = "test.pdf"
            upload_file.content_type = "application/pdf"
            upload_file.file = io.BytesIO(content)

            with pytest.raises(Exception):
                service.validate_and_upload(
                    clerk_user_id="user_charlie",
                    upload_file=upload_file,
                )

            # Assert cleanup was called
            assert len(fake_storage.deleted_keys) == 1

    def test_delete_flow_removes_from_storage_and_db(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
        fake_storage: InMemoryStorageService,
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_david")

        # Upload
        resp_upload = document_client.post(
            "/api/v1/documents",
            headers=auth_header(token),
            files={"file": ("delete-me.pdf", _valid_pdf_content(), "application/pdf")},
        )
        assert resp_upload.status_code == 201
        doc_id = resp_upload.json()["id"]

        # Delete
        resp_del = document_client.delete(
            f"/api/v1/documents/{doc_id}",
            headers=auth_header(token),
        )
        assert resp_del.status_code == 200
        assert resp_del.json()["deleted"] is True

        # Ensure object removed from storage
        assert len(fake_storage.objects) == 0

        # Ensure 404 on subsequent get
        resp_get = document_client.get(
            f"/api/v1/documents/{doc_id}",
            headers=auth_header(token),
        )
        assert resp_get.status_code == 404

    def test_pagination_works(
        self,
        document_client: TestClient,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_emma")

        # Upload 3 documents
        for i in range(3):
            document_client.post(
                "/api/v1/documents",
                headers=auth_header(token),
                files={"file": (f"doc_{i}.pdf", _valid_pdf_content(), "application/pdf")},
            )

        # Request limit=2 offset=0
        resp_page1 = document_client.get(
            "/api/v1/documents?limit=2&offset=0",
            headers=auth_header(token),
        )
        assert resp_page1.status_code == 200
        data1 = resp_page1.json()
        assert data1["total"] == 3
        assert len(data1["items"]) == 2
        assert data1["limit"] == 2
        assert data1["offset"] == 0

        # Request limit=2 offset=2
        resp_page2 = document_client.get(
            "/api/v1/documents?limit=2&offset=2",
            headers=auth_header(token),
        )
        assert resp_page2.status_code == 200
        data2 = resp_page2.json()
        assert data2["total"] == 3
        assert len(data2["items"]) == 1
        assert data2["offset"] == 2

