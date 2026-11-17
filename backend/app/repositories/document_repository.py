"""Document repository: data access for user-uploaded documents."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus

logger = logging.getLogger(__name__)


class DocumentRepository:
    """Data-access operations for the ``documents`` table."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(
        self,
        clerk_user_id: str,
        *,
        document_id: uuid.UUID | None = None,
        original_filename: str,
        storage_key: str,
        mime_type: str,
        file_size_bytes: int,
        status: DocumentStatus = DocumentStatus.UPLOADED,
        page_count: int | None = None,
    ) -> Document:
        """Insert a new Document record for an authenticated user."""
        doc = Document(
            id=document_id or uuid.uuid4(),
            clerk_user_id=clerk_user_id,
            original_filename=original_filename,
            storage_key=storage_key,
            mime_type=mime_type,
            file_size_bytes=file_size_bytes,
            status=status,
            page_count=page_count,
        )
        self._session.add(doc)
        self._session.flush()
        return doc

    def get_by_id(
        self,
        document_id: uuid.UUID,
        clerk_user_id: str,
    ) -> Document | None:
        """Find a document by ID enforcing owner identity.

        Returns None if not found or if owned by another user.
        """
        statement = select(Document).where(
            Document.id == document_id,
            Document.clerk_user_id == clerk_user_id,
        )
        return self._session.execute(statement).scalar_one_or_none()

    def list_for_user(
        self,
        clerk_user_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Document]:
        """List documents owned by the authenticated user, newest first."""
        statement = (
            select(Document)
            .where(Document.clerk_user_id == clerk_user_id)
            .order_by(Document.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.execute(statement).scalars())

    def count_for_user(self, clerk_user_id: str) -> int:
        """Return the total document count for the authenticated user."""
        statement = (
            select(func.count())
            .select_from(Document)
            .where(Document.clerk_user_id == clerk_user_id)
        )
        return self._session.execute(statement).scalar_one()

    def delete(self, document: Document) -> None:
        """Delete a Document record."""
        self._session.delete(document)
        self._session.flush()

