"""Pydantic schemas for RAG indexing status and management (Phase 10)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentIndexStatusResponse(BaseModel):
    """Public indexing status response for a document."""

    model_config = ConfigDict(from_attributes=True)

    document_id: uuid.UUID = Field(..., description="Document identifier")
    status: str = Field(..., description="Indexing status: pending, indexing, completed, failed")
    chunk_count: int = Field(default=0, description="Number of indexed passage chunks")
    embedding_provider: str = Field(default="local", description="Embedding provider name")
    embedding_model: str = Field(..., description="Embedding model identifier")
    embedding_dimensions: int = Field(default=384, description="Vector dimensions")
    indexed_at: datetime | None = Field(default=None, description="Timestamp when indexing completed")
    error_message: str | None = Field(default=None, description="Error message if indexing failed")


class DocumentReindexResponse(BaseModel):
    """Response returned when requesting a document reindex."""

    document_id: uuid.UUID = Field(..., description="Document identifier")
    status: str = Field(..., description="Indexing status after reindex request")
    message: str = Field(..., description="Human-readable result message")
    enqueued: bool = Field(default=True, description="Whether the background indexing task was enqueued")

