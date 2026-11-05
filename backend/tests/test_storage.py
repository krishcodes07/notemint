"""Storage service tests.

Unit tests mock boto3/S3 entirely — no credentials or network required.
A live round-trip test against the real Neon bucket runs only when
credentials are configured (and always deletes its temporary object).
"""

from __future__ import annotations

import io
import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from app.core.config import settings
from app.integrations import neon_storage
from app.integrations.neon_storage import (
    StorageNotConfiguredError,
    StorageObjectNotFoundError,
    StorageUnavailableError,
    get_s3_client,
    reset_s3_client,
)
from app.services.storage_service import (
    ObjectKeyError,
    StorageService,
    build_document_key,
    get_storage_service,
)


def _client_error(code: str, status: int = 404) -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": "boom"}},
        operation_name="TestOperation",
    )


@pytest.fixture()
def mock_s3() -> MagicMock:
    return MagicMock()


@pytest.fixture()
def service(mock_s3: MagicMock) -> StorageService:
    return StorageService(client=mock_s3, bucket="notemint-files")


# ---------------------------------------------------------------------------
# Object key generation
# ---------------------------------------------------------------------------


class TestBuildDocumentKey:
    def test_canonical_format(self) -> None:
        doc_id = uuid.uuid4()
        key = build_document_key("user_abc123", doc_id)
        assert key == f"users/user_abc123/documents/{doc_id}/original.pdf"

    def test_accepts_uuid_string(self) -> None:
        doc_id = str(uuid.uuid4())
        key = build_document_key("user_abc123", doc_id)
        assert doc_id in key

    def test_rejects_path_traversal_in_user_id(self) -> None:
        for bad in (
            "user_abc/../evil",
            "../evil",
            "user_abc/..",
            "user_abc/extra/path",
            "user_abc/../../etc/passwd",
            "not-a-clerk-id",
            "",
        ):
            with pytest.raises(ObjectKeyError):
                build_document_key(bad, uuid.uuid4())

    def test_rejects_non_uuid_document_id(self) -> None:
        for bad in ("../../etc/passwd", "abc", "", None):
            with pytest.raises(ObjectKeyError):
                build_document_key("user_abc123", bad)  # type: ignore[arg-type]

    def test_unsafe_filename_falls_back_to_original_pdf(self) -> None:
        doc_id = uuid.uuid4()
        key = build_document_key(
            "user_abc123", doc_id, filename="../../secrets.txt"
        )
        assert key.endswith("/original.pdf")
        assert ".." not in key

    def test_safe_filename_preserved(self) -> None:
        doc_id = uuid.uuid4()
        key = build_document_key(
            "user_abc123", doc_id, filename="lecture-notes.pdf"
        )
        assert key.endswith("/lecture-notes.pdf")

    def test_key_never_starts_with_slash_or_contains_double_slash(
        self,
    ) -> None:
        key = build_document_key("user_abc123", uuid.uuid4())
        assert not key.startswith("/")
        assert "//" not in key


# ---------------------------------------------------------------------------
# Upload / download / delete / exists (mocked boto3)
# ---------------------------------------------------------------------------


class TestUpload:
    def test_upload_uses_correct_bucket_and_content_type(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        key = "users/user_a/documents/x/original.pdf"
        payload = io.BytesIO(b"%PDF-1.4 test")

        service.upload_fileobj(key, payload, content_type="application/pdf")

        mock_s3.upload_fileobj.assert_called_once()
        args, kwargs = mock_s3.upload_fileobj.call_args
        assert args[1] == "notemint-files"  # bucket
        assert args[2] == key
        assert kwargs["ExtraArgs"]["ContentType"] == "application/pdf"

    def test_upload_bytes_sets_content_type(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        service.upload_bytes("k/v.txt", b"hello", content_type="text/plain")
        args, kwargs = mock_s3.upload_fileobj.call_args
        assert kwargs["ExtraArgs"]["ContentType"] == "text/plain"

    def test_upload_connectivity_error_is_wrapped(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.upload_fileobj.side_effect = EndpointConnectionError(
            endpoint_url="https://example.invalid"
        )
        with pytest.raises(StorageUnavailableError):
            service.upload_bytes("k", b"x")

    def test_upload_client_error_is_wrapped(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.upload_fileobj.side_effect = _client_error("AccessDenied", 403)
        with pytest.raises(StorageUnavailableError):
            service.upload_bytes("k", b"x")


class TestDownload:
    def test_download_streams_to_fileobj(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        def fake_download(bucket: str, key: str, fileobj: Any) -> None:
            fileobj.write(b"file-bytes")

        mock_s3.download_fileobj.side_effect = fake_download
        buffer = io.BytesIO()
        service.download_fileobj("some/key.pdf", buffer)
        assert buffer.getvalue() == b"file-bytes"
        mock_s3.download_fileobj.assert_called_once_with(
            "notemint-files", "some/key.pdf", buffer
        )

    def test_download_missing_object_raises_not_found(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.download_fileobj.side_effect = _client_error("404")
        with pytest.raises(StorageObjectNotFoundError):
            service.download_fileobj("missing/key", io.BytesIO())

    def test_download_connectivity_error_wrapped(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.download_fileobj.side_effect = EndpointConnectionError(
            endpoint_url="https://example.invalid"
        )
        with pytest.raises(StorageUnavailableError):
            service.download_fileobj("k", io.BytesIO())

    def test_download_bytes_roundtrip(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        def fake_download(bucket: str, key: str, fileobj: Any) -> None:
            fileobj.write(b"abc123")

        mock_s3.download_fileobj.side_effect = fake_download
        assert service.download_bytes("k") == b"abc123"


class TestDelete:
    def test_delete_calls_s3_with_bucket_and_key(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        assert service.delete("users/u/documents/d/original.pdf") is True
        mock_s3.delete_object.assert_called_once_with(
            Bucket="notemint-files",
            Key="users/u/documents/d/original.pdf",
        )

    def test_delete_missing_object_returns_false(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.delete_object.side_effect = _client_error("NoSuchKey")
        assert service.delete("gone") is False

    def test_delete_error_wrapped(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.delete_object.side_effect = _client_error("AccessDenied", 403)
        with pytest.raises(StorageUnavailableError):
            service.delete("k")


class TestExists:
    def test_exists_true(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_object.return_value = {"ContentLength": 1}
        assert service.exists("k") is True
        mock_s3.head_object.assert_called_once_with(
            Bucket="notemint-files", Key="k"
        )

    def test_exists_false_for_missing_object(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_object.side_effect = _client_error("404")
        assert service.exists("k") is False

    def test_exists_false_for_access_denied(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_object.side_effect = _client_error("AccessDenied", 403)
        assert service.exists("k") is False

    def test_exists_wraps_connectivity_error(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_object.side_effect = EndpointConnectionError(
            endpoint_url="https://example.invalid"
        )
        with pytest.raises(StorageUnavailableError):
            service.exists("k")


class TestHealthCheck:
    def test_health_check_ok(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_bucket.return_value = {}
        service.health_check()
        mock_s3.head_bucket.assert_called_once_with(Bucket="notemint-files")

    def test_health_check_missing_bucket_wrapped(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_bucket.side_effect = _client_error("404")
        with pytest.raises(StorageUnavailableError):
            service.health_check()

    def test_health_check_connectivity_wrapped(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_bucket.side_effect = EndpointConnectionError(
            endpoint_url="https://example.invalid"
        )
        with pytest.raises(StorageUnavailableError):
            service.health_check()

    def test_health_check_never_leaks_error_messages(
        self, service: StorageService, mock_s3: MagicMock
    ) -> None:
        mock_s3.head_bucket.side_effect = _client_error("AccessDenied", 403)
        with pytest.raises(StorageUnavailableError) as excinfo:
            service.health_check()
        assert "AccessDenied" not in str(excinfo.value)
        assert "nak_live" not in str(excinfo.value)


class TestConfiguration:
    def test_service_factory_returns_service(self) -> None:
        assert isinstance(get_storage_service(), StorageService)

    @pytest.mark.skipif(
        not settings.storage_configured,
        reason="Neon Object Storage credentials not configured",
    )
    def test_s3_client_configuration(self) -> None:
        """Client is wired to the Neon endpoint with path-style addressing."""
        captured: dict[str, Any] = {}

        def fake_client(service_name: str, **kwargs: Any) -> MagicMock:
            captured["service"] = service_name
            captured.update(kwargs)
            return MagicMock()

        original = neon_storage.boto3.client
        neon_storage.boto3.client = fake_client  # type: ignore[assignment]
        reset_s3_client()
        try:
            client = get_s3_client()
        finally:
            neon_storage.boto3.client = original  # type: ignore[assignment]
            reset_s3_client()

        assert client is not None
        assert captured["service"] == "s3"
        assert captured["endpoint_url"] == settings.aws_endpoint_url_s3
        assert captured["region_name"] == settings.aws_region
        assert captured["aws_access_key_id"] == settings.aws_access_key_id
        assert captured["aws_secret_access_key"] == settings.aws_secret_access_key
        assert captured["config"].s3["addressing_style"] == "path"

    @pytest.mark.skipif(
        settings.storage_configured,
        reason="Storage is configured; missing-config path not applicable",
    )
    def test_unconfigured_storage_raises(self) -> None:
        with pytest.raises(StorageNotConfiguredError):
            get_s3_client()


# ---------------------------------------------------------------------------
# Live round-trip against the real Neon bucket (skipped without credentials)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    not settings.storage_configured,
    reason="Neon Object Storage credentials not configured",
)
class TestLiveNeonStorage:
    """Real S3 round-trip using a temporary object — never user data."""

    def test_upload_exists_download_delete(self) -> None:
        service = StorageService()
        key = build_document_key("user_phase3test", uuid.uuid4())
        payload = b"NoteMint Phase 3 storage integration test"

        try:
            service.upload_bytes(key, payload, content_type="text/plain")
            assert service.exists(key) is True
            assert service.download_bytes(key) == payload
        finally:
            service.delete(key)

        assert service.exists(key) is False

    def test_health_check_against_real_bucket(self) -> None:
        StorageService().health_check()  # must not raise

    def test_missing_object_lives_is_false(self) -> None:
        service = StorageService()
        key = build_document_key("user_phase3test", uuid.uuid4())
        assert service.exists(key) is False
        with pytest.raises(StorageObjectNotFoundError):
            service.download_bytes(key)
