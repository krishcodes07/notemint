"""Document API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    """Metadata response for an uploaded or retrieved document."""

    id: uuid.UUID = Field(description="Unique document ID (UUID)")
    original_filename: str = Field(description="Original uploaded filename")
    mime_type: str = Field(description="File MIME type (e.g. application/pdf)")
    file_size_bytes: int = Field(description="File size in bytes")
    status: str = Field(description="Processing status (uploaded, extracting, etc.)")
    page_count: int | None = Field(
        default=None, description="Page count (null until extracted in Phase 6)"
    )
    created_at: datetime = Field(description="Upload timestamp")

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    """Paginated list of documents owned by the user."""

    items: list[DocumentResponse] = Field(description="List of document metadata items")
    total: int = Field(description="Total count of documents owned by user")
    limit: int = Field(description="Pagination limit applied")
    offset: int = Field(description="Pagination offset applied")


class DocumentDeleteResponse(BaseModel):
    """Confirmation response upon document deletion."""

    id: uuid.UUID = Field(description="ID of the deleted document")
    deleted: bool = Field(default=True, description="Deletion success indicator")
    message: str = Field(
        default="Document deleted successfully",
        description="Human-readable confirmation message",
    )

