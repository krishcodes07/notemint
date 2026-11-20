"""Pydantic schemas for document extraction status and pages (Phase 6)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.document import DocumentStatus
from app.models.document_extraction import ExtractionStatus


class ExtractionQualitySchema(BaseModel):
    """Schema for extraction diagnostics and quality."""

    model_config = ConfigDict(extra="ignore")

    is_scanned: bool = Field(default=False)
    ocr_required: bool = Field(default=False)
    empty_pages: list[int] = Field(default_factory=list)
    low_text_pages: list[int] = Field(default_factory=list)
    extraction_success: bool = Field(default=True)
    reason: str | None = Field(default=None)


class DocumentExtractionResponse(BaseModel):
    """Response schema for GET /api/v1/documents/{id}/extraction."""

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    document_id: uuid.UUID
    document_status: DocumentStatus
    extraction_status: ExtractionStatus | None = None
    page_count: int | None = None
    total_characters: int = 0
    is_scanned: bool = False
    quality: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DocumentReprocessResponse(BaseModel):
    """Response schema for POST /api/v1/documents/{id}/reprocess."""

    model_config = ConfigDict(extra="ignore")

    document_id: uuid.UUID
    document_status: DocumentStatus
    message: str
    enqueued: bool


class DocumentPageResponse(BaseModel):
    """Response schema for individual page extracted text."""

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    page_number: int
    text: str
    character_count: int
    has_text: bool

