"""Document service orchestrating validation, storage, and database persistence."""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import PurePosixPath
from typing import BinaryIO, Iterator

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.integrations.neon_storage import (
    StorageObjectNotFoundError,
    StorageUnavailableError,
)
from app.models.document import Document, DocumentStatus
from app.repositories.document_repository import DocumentRepository
from app.repositories.user_repository import UserRepository
from app.services.storage_service import (
    StorageService,
    build_document_key,
    get_storage_service,
)

logger = logging.getLogger(__name__)

# Pattern for safe original filename display: strip path separators, control chars
_UNSAFE_CHARS_PATTERN = re.compile(r"[\x00-\x1f\x7f\\/<>:\"|?*]")


class DocumentServiceError(Exception):
    """Base error for document service operations."""


class InvalidPDFError(DocumentServiceError):
    """Uploaded file is not a valid PDF."""


class FileTooLargeError(DocumentServiceError):
    """Uploaded file exceeds the maximum allowed size limit."""


class DocumentNotFoundError(DocumentServiceError):
    """Document not found or does not belong to the user."""


def sanitize_filename(filename: str | None) -> str:
    """Sanitize original filename for display and metadata storage.

    Neutralizes path traversal, removes control characters and path separators,
    and enforces maximum length.
    """
    if not filename:
        return "document.pdf"

    # Extract basename only (handling both POSIX and Windows separators)
    name = PurePosixPath(filename.replace("\\", "/")).name
    name = _UNSAFE_CHARS_PATTERN.sub("_", name).strip()

    if not name or name.startswith("."):
        name = "document.pdf"

    # Truncate if exceeds column limit while preserving extension
    if len(name) > 255:
        stem = name[:240]
        ext = ".pdf"
        name = f"{stem}{ext}"

    return name


class DocumentService:
    """Service orchestrating PDF upload validation, S3 storage, and DB persistence."""

    def __init__(
        self,
        session: Session,
        storage_service: StorageService | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._session = session
        self._doc_repo = DocumentRepository(session)
        self._user_repo = UserRepository(session)
        self._storage_service = storage_service or get_storage_service()
        self._settings = settings or get_settings()

    def validate_and_upload(
        self,
        clerk_user_id: str,
        upload_file: UploadFile,
    ) -> Document:
        """Validate an uploaded PDF, upload to private storage, and persist DB row.

        Enforces:
        - PDF extension check
        - MIME type check
        - PDF magic bytes signature check (%PDF-)
        - Configurable size limit enforcement
        - S3 and DB consistency with cleanup on failure
        """
        raw_filename = upload_file.filename or ""
        safe_filename = sanitize_filename(raw_filename)

        # 1. Extension validation (case-insensitive)
        if not safe_filename.lower().endswith(".pdf"):
            raise InvalidPDFError("File extension must be .pdf")

        # 2. MIME type validation
        content_type = (upload_file.content_type or "").lower().split(";")[0].strip()
        if content_type != "application/pdf":
            raise InvalidPDFError(
                f"Invalid MIME type: {content_type or 'unknown'}. Only application/pdf is allowed."
            )

        # 3. Stream validation: inspect magic bytes and measure size chunk by chunk
        file_obj: BinaryIO = upload_file.file
        chunk_size = 64 * 1024
        max_bytes = self._settings.max_upload_size_bytes

        header = file_obj.read(5)
        if len(header) < 5 or not header.startswith(b"%PDF-"):
            raise InvalidPDFError("File does not start with a valid PDF signature (%PDF-)")

        total_bytes = len(header)
        while True:
            chunk = file_obj.read(chunk_size)
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                raise FileTooLargeError(
                    f"File exceeds maximum allowed size of {self._settings.max_upload_size_mb} MB"
                )

        if total_bytes <= 0:
            raise InvalidPDFError("Uploaded PDF file is empty")

        # Rewind file to beginning for upload
        file_obj.seek(0)

        # 4. Generate document ID and safe storage key
        document_id = uuid.uuid4()
        storage_key = build_document_key(
            clerk_user_id=clerk_user_id,
            document_id=document_id,
            filename=safe_filename,
        )

        # 5. Upload to Neon Object Storage
        try:
            self._storage_service.upload_fileobj(
                key=storage_key,
                fileobj=file_obj,
                content_type="application/pdf",
            )
        except StorageUnavailableError:
            raise
        except Exception as exc:
            logger.exception("Failed to upload object to storage for key %s", storage_key)
            raise StorageUnavailableError("Storage service unavailable for upload") from exc

        # 6. Persist to PostgreSQL with cleanup on failure
        try:
            # Ensure user profile row exists for foreign key constraint
            self._user_repo.upsert(clerk_user_id=clerk_user_id)

            document = self._doc_repo.create(
                clerk_user_id=clerk_user_id,
                document_id=document_id,
                original_filename=safe_filename,
                storage_key=storage_key,
                mime_type="application/pdf",
                file_size_bytes=total_bytes,
                status=DocumentStatus.UPLOADED,
            )
            # Flush to verify constraints within the session
            self._session.flush()
            return document

        except Exception as exc:
            logger.exception("Database persistence failed after storage upload for %s", storage_key)
            # Cleanup orphaned storage object
            try:
                self._storage_service.delete(storage_key)
                logger.info("Successfully cleaned up orphaned storage object %s", storage_key)
            except Exception as cleanup_exc:
                logger.error(
                    "Failed to clean up orphaned storage object %s: %s",
                    storage_key,
                    cleanup_exc,
                )
            raise DocumentServiceError("Failed to persist document metadata") from exc

    def list_documents(
        self,
        clerk_user_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Document], int]:
        """List documents owned by the user with pagination."""
        items = self._doc_repo.list_for_user(
            clerk_user_id,
            limit=limit,
            offset=offset,
        )
        total = self._doc_repo.count_for_user(clerk_user_id)
        return items, total

    def get_document(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> Document:
        """Get document details enforcing user ownership.

        Raises:
            DocumentNotFoundError: if document does not exist or belongs to another user.
        """
        doc = self._doc_repo.get_by_id(document_id, clerk_user_id)
        if doc is None:
            raise DocumentNotFoundError("Document not found")
        return doc

    def delete_document(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> bool:
        """Delete document from storage and database.

        Deletion consistency:
        - Check document exists and belongs to user.
        - Delete from object storage first.
        - If storage deletion fails with StorageUnavailableError, abort without
          deleting DB record so object is not orphaned in S3.
        - Delete database record.
        """
        doc = self.get_document(clerk_user_id, document_id)

        # Delete from storage first
        self._storage_service.delete(doc.storage_key)

        # Delete from DB
        self._doc_repo.delete(doc)
        self._session.flush()
        return True

    def get_document_stream(
        self,
        clerk_user_id: str,
        document_id: uuid.UUID,
    ) -> tuple[Document, Iterator[bytes]]:
        """Get streaming iterator for document PDF enforcing user ownership."""
        doc = self.get_document(clerk_user_id, document_id)
        stream_iter, _, _ = self._storage_service.get_object_stream(doc.storage_key)
        return doc, stream_iter

