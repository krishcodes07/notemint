"""Automated tests for Phase 10 vector dimension migration safety."""

from __future__ import annotations

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from alembic.config import Config
from alembic import command
from app.models.document_chunk import DocumentChunk
from app.models.document_index import DocumentIndex
from app.core.config import settings


def test_schema_vector_dimensions_in_metadata() -> None:
    """Verify that DocumentChunk and DocumentIndex models reflect 1024 dimensions."""
    assert DocumentChunk.embedding.type.dim == 1024
    assert DocumentIndex.embedding_dimensions.server_default.arg == "1024"
    assert DocumentIndex.embedding_provider.server_default.arg == "jina"
    assert settings.embedding_dimensions == 1024
    assert settings.embedding_provider == "jina"
    assert settings.embedding_model == "jina-embeddings-v3"


def test_migration_file_structure() -> None:
    """Inspect migration 9e0f1a2b3c4d for proper down_revision and safe operations."""
    import importlib.util
    from pathlib import Path

    migration_path = Path(__file__).parent.parent / "alembic" / "versions" / "9e0f1a2b3c4d_update_vector_dimensions_to_1024.py"
    assert migration_path.exists(), f"Migration script {migration_path} does not exist"

    spec = importlib.util.spec_from_file_location("migration_9e0f1a2b3c4d", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "9e0f1a2b3c4d"
    assert module.down_revision == "8d9e0f1a2b3c"
    assert callable(module.upgrade)
    assert callable(module.downgrade)


def test_table_columns_exist_in_sqlite(sqlite_engine: Engine) -> None:
    """Verify that the test sqlite database includes all expected Phase 10 columns."""
    inspector = inspect(sqlite_engine)
    chunk_columns = {col["name"]: col for col in inspector.get_columns("document_chunks")}
    index_columns = {col["name"]: col for col in inspector.get_columns("document_indexes")}

    assert "embedding" in chunk_columns
    assert "document_id" in chunk_columns
    assert "chunk_index" in chunk_columns
    assert "content_hash" in chunk_columns

    assert "embedding_provider" in index_columns
    assert "embedding_model" in index_columns
    assert "embedding_dimensions" in index_columns
    assert "status" in index_columns
