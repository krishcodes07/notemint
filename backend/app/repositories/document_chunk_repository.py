"""Repository for DocumentChunk data access and vector similarity retrieval (Phase 10)."""

from __future__ import annotations

import logging
import uuid
from typing import Sequence

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.document_chunk import DocumentChunk

logger = logging.getLogger(__name__)


class DocumentChunkRepository:
    """Manages persistence and vector similarity queries for DocumentChunk records."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create_chunks(self, chunks: list[DocumentChunk]) -> list[DocumentChunk]:
        """Bulk persist document chunks within the current transaction."""
        self._session.add_all(chunks)
        self._session.flush()
        return chunks

    def get_chunks_for_document(
        self, document_id: uuid.UUID, limit: int = 1000, offset: int = 0
    ) -> list[DocumentChunk]:
        """Fetch all chunks for a document ordered by chunk_index."""
        stmt = (
            select(DocumentChunk)
            .where(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt).all())

    def get_chunk_count_for_document(self, document_id: uuid.UUID) -> int:
        """Count total chunks stored for a document."""
        from sqlalchemy import func

        stmt = (
            select(func.count(DocumentChunk.id))
            .where(DocumentChunk.document_id == document_id)
        )
        return self._session.scalar(stmt) or 0

    def delete_chunks_for_document(self, document_id: uuid.UUID) -> int:
        """Delete all existing chunks for a document."""
        stmt = delete(DocumentChunk).where(DocumentChunk.document_id == document_id)
        result = self._session.execute(stmt)
        return result.rowcount or 0

    def search_vector_similarity(
        self,
        document_id: uuid.UUID,
        query_vector: list[float],
        top_k: int = 8,
        min_similarity: float = 0.0,
    ) -> list[tuple[DocumentChunk, float]]:
        """Search top-K most similar chunks for a specific document.

        Uses PostgreSQL pgvector cosine distance `<=>` when running on PostgreSQL,
        or in-memory numpy cosine similarity when running on SQLite (unit test portability).

        Guarantees strict document isolation: only chunks belonging to document_id are searched.
        """
        bind = self._session.get_bind()
        is_postgres = bind.dialect.name == "postgresql"

        if is_postgres:
            # pgvector cosine distance: distance = 1 - cosine_similarity
            # cosine_distance operator: DocumentChunk.embedding.cosine_distance(query_vector)
            cosine_dist_expr = DocumentChunk.embedding.cosine_distance(query_vector)
            stmt = (
                select(DocumentChunk, (1.0 - cosine_dist_expr).label("similarity"))
                .where(
                    DocumentChunk.document_id == document_id,
                    DocumentChunk.embedding.is_not(None),
                )
                .order_by(cosine_dist_expr.asc())
                .limit(top_k)
            )
            rows = self._session.execute(stmt).all()
            results: list[tuple[DocumentChunk, float]] = []
            for chunk, sim in rows:
                sim_float = float(sim) if sim is not None else 0.0
                if sim_float >= min_similarity:
                    results.append((chunk, sim_float))
            return results

        # SQLite fallback: fetch document chunks and compute cosine similarity in memory
        chunks = self.get_chunks_for_document(document_id, limit=5000)
        if not chunks:
            return []

        q_vec = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []

        scored: list[tuple[DocumentChunk, float]] = []
        for c in chunks:
            if c.embedding is None:
                continue
            c_vec = np.array(c.embedding, dtype=np.float32)
            c_norm = np.linalg.norm(c_vec)
            if c_norm == 0:
                continue
            sim = float(np.dot(q_vec, c_vec) / (q_norm * c_norm))
            if sim >= min_similarity:
                scored.append((c, sim))

        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:top_k]

