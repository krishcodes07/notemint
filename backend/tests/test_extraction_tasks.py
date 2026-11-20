"""Background worker task tests for Celery PDF extraction (Phase 6)."""

from __future__ import annotations

import io
import os
import uuid
from typing import Any, BinaryIO, Iterator
from unittest.mock import MagicMock, patch

import pymupdf
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.integrations.neon_storage import (
    StorageObjectNotFoundError,
    StorageUnavailableError,
)
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import ExtractionStatus
from app.models.user import User
from app.repositories.extraction_repository import ExtractionRepository
from app.services.storage_service import StorageService
from app.tasks.extraction import process_document_extraction


def _generate_valid_pdf_bytes(text: str = "Life processes in living organisms.") -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    doc.set_metadata({"title": "Life Processes", "author": "Dr. Sharma"})
    b = doc.tobytes()
    doc.close()
    return b


def _generate_scanned_pdf_bytes() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 10, 10), 0)
    pix.clear_with(220)
    page.insert_image(pymupdf.Rect(50, 50, 300, 300), pixmap=pix)
    b = doc.tobytes()
    doc.close()
    return b


class FakeStorageService:
    """In-memory storage service for background task testing."""

    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.fail_unavailable = False

    def download_fileobj(self, key: str, fileobj: BinaryIO) -> None:
        if self.fail_unavailable:
            raise StorageUnavailableError("Simulated storage network interruption")
        if key not in self.files:
            raise StorageObjectNotFoundError(key)
        fileobj.write(self.files[key])


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture
def fake_storage() -> FakeStorageService:
    return FakeStorageService()


class TestExtractionTask:
    def test_task_processes_valid_pdf_successfully(
        self, test_db: Any, fake_storage: FakeStorageService
    ) -> None:
        pdf_bytes = _generate_valid_pdf_bytes("Photosynthesis converts light into chemical energy.")
        doc_id = uuid.uuid4()
        storage_key = f"users/user_123/documents/{doc_id}/original.pdf"
        fake_storage.files[storage_key] = pdf_bytes

        with test_db() as session:
            session.add(User(clerk_user_id="user_123"))
            session.flush()
            session.add(
                Document(
                    id=doc_id,
                    clerk_user_id="user_123",
                    original_filename="photosynthesis.pdf",
                    storage_key=storage_key,
                    mime_type="application/pdf",
                    file_size_bytes=len(pdf_bytes),
                    status=DocumentStatus.UPLOADED,
                )
            )
            session.commit()

        with (
            patch("app.tasks.extraction.get_session_factory", return_value=test_db),
            patch("app.tasks.extraction.get_storage_service", return_value=fake_storage),
        ):
            result = process_document_extraction.apply(args=[str(doc_id)]).get()

        assert result["status"] == "completed"
        assert result["page_count"] == 1
        assert result["total_characters"] > 20

        with test_db() as session:
            doc = session.get(Document, doc_id)
            assert doc is not None
            assert doc.status == DocumentStatus.COMPLETED
            assert doc.page_count == 1

            repo = ExtractionRepository(session)
            ext = repo.get_by_document_id(doc_id)
            assert ext is not None
            assert ext.status == ExtractionStatus.COMPLETED
            pages = repo.get_pages_for_document(doc_id)
            assert len(pages) == 1
            assert "Photosynthesis" in pages[0].text

    def test_task_handles_missing_document(
        self, test_db: Any, fake_storage: FakeStorageService
    ) -> None:
        missing_id = uuid.uuid4()
        with (
            patch("app.tasks.extraction.get_session_factory", return_value=test_db),
            patch("app.tasks.extraction.get_storage_service", return_value=fake_storage),
        ):
            result = process_document_extraction.apply(args=[str(missing_id)]).get()

        assert result["status"] == "not_found"

    def test_task_handles_missing_storage_file(
        self, test_db: Any, fake_storage: FakeStorageService
    ) -> None:
        doc_id = uuid.uuid4()
        storage_key = f"users/user_123/documents/{doc_id}/original.pdf"
        # File is deliberately NOT added to fake_storage

        with test_db() as session:
            session.add(User(clerk_user_id="user_123"))
            session.flush()
            session.add(
                Document(
                    id=doc_id,
                    clerk_user_id="user_123",
                    original_filename="missing.pdf",
                    storage_key=storage_key,
                    mime_type="application/pdf",
                    file_size_bytes=100,
                    status=DocumentStatus.UPLOADED,
                )
            )
            session.commit()

        with (
            patch("app.tasks.extraction.get_session_factory", return_value=test_db),
            patch("app.tasks.extraction.get_storage_service", return_value=fake_storage),
        ):
            result = process_document_extraction.apply(args=[str(doc_id)]).get()

        assert result["status"] == "failed"
        with test_db() as session:
            doc = session.get(Document, doc_id)
            assert doc is not None
            assert doc.status == DocumentStatus.FAILED
            repo = ExtractionRepository(session)
            ext = repo.get_by_document_id(doc_id)
            assert ext is not None
            assert "not found in storage" in (ext.error_message or "").lower()

    def test_task_detects_scanned_pdf_and_marks_failed(
        self, test_db: Any, fake_storage: FakeStorageService
    ) -> None:
        scanned_bytes = _generate_scanned_pdf_bytes()
        doc_id = uuid.uuid4()
        storage_key = f"users/user_123/documents/{doc_id}/scanned.pdf"
        fake_storage.files[storage_key] = scanned_bytes

        with test_db() as session:
            session.add(User(clerk_user_id="user_123"))
            session.flush()
            session.add(
                Document(
                    id=doc_id,
                    clerk_user_id="user_123",
                    original_filename="scanned.pdf",
                    storage_key=storage_key,
                    mime_type="application/pdf",
                    file_size_bytes=len(scanned_bytes),
                    status=DocumentStatus.UPLOADED,
                )
            )
            session.commit()

        with (
            patch("app.tasks.extraction.get_session_factory", return_value=test_db),
            patch("app.tasks.extraction.get_storage_service", return_value=fake_storage),
        ):
            result = process_document_extraction.apply(args=[str(doc_id)]).get()

        assert result["status"] == "failed"
        assert result["is_scanned"] is True
        assert result["ocr_required"] is True

        with test_db() as session:
            doc = session.get(Document, doc_id)
            assert doc is not None
            assert doc.status == DocumentStatus.FAILED

            repo = ExtractionRepository(session)
            ext = repo.get_by_document_id(doc_id)
            assert ext is not None
            assert ext.status == ExtractionStatus.FAILED
            assert ext.quality.get("is_scanned") is True

    def test_task_cleans_up_temporary_file(
        self, test_db: Any, fake_storage: FakeStorageService
    ) -> None:
        pdf_bytes = _generate_valid_pdf_bytes("Temp file test content.")
        doc_id = uuid.uuid4()
        storage_key = f"users/user_123/documents/{doc_id}/original.pdf"
        fake_storage.files[storage_key] = pdf_bytes

        with test_db() as session:
            session.add(User(clerk_user_id="user_123"))
            session.flush()
            session.add(
                Document(
                    id=doc_id,
                    clerk_user_id="user_123",
                    original_filename="temp.pdf",
                    storage_key=storage_key,
                    mime_type="application/pdf",
                    file_size_bytes=len(pdf_bytes),
                    status=DocumentStatus.UPLOADED,
                )
            )
            session.commit()

        temp_paths_created: list[str] = []
        original_named_temp = __import__("tempfile").NamedTemporaryFile

        def tracking_temp_file(*args, **kwargs):
            tf = original_named_temp(*args, **kwargs)
            temp_paths_created.append(tf.name)
            return tf

        with (
            patch("app.tasks.extraction.get_session_factory", return_value=test_db),
            patch("app.tasks.extraction.get_storage_service", return_value=fake_storage),
            patch("tempfile.NamedTemporaryFile", side_effect=tracking_temp_file),
        ):
            process_document_extraction.apply(args=[str(doc_id)]).get()

        assert len(temp_paths_created) == 1
        # Temporary file must be deleted!
        assert not os.path.exists(temp_paths_created[0])

