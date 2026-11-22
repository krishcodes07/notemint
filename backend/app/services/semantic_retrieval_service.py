"""Semantic vector retrieval service for NoteMint RAG (Phase 10)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy.orm import Session

from app.ai.embeddings.base import BaseEmbeddingProvider
from app.ai.embeddings.provider_factory import get_embedding_provider
from app.core.config import settings
from app.models.document_chunk import DocumentChunk
from app.repositories.document_chunk_repository import DocumentChunkRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetrievedChunk:
    """Retrieved passage chunk with similarity score and page provenance."""

    chunk_id: uuid.UUID
    chunk_index: int
    text: str
    page_start: int
    page_end: int
    page_numbers: list[int]
    similarity_score: float
    token_count: int


class SemanticRetrievalService:
    """Executes dense vector similarity search over indexed document chunks."""

    def __init__(
        self,
        session: Session,
        embedding_provider: BaseEmbeddingProvider | None = None,
        chunk_repository: DocumentChunkRepository | None = None,
    ) -> None:
        self._session = session
        self._embedding_provider = embedding_provider or get_embedding_provider()
        self._chunk_repo = chunk_repository or DocumentChunkRepository(session)

    def retrieve_candidates(
        self,
        document_id: uuid.UUID,
        query: str,
        top_k: int | None = None,
        min_similarity: float = 0.0,
    ) -> list[RetrievedChunk]:
        """Generate query embedding and retrieve top-K matching chunks for document_id.

        Args:
            document_id: Target document UUID (enforces ownership isolation).
            query: User doubt or question string.
            top_k: Maximum number of chunks to return (default: settings.rag_top_k).
            min_similarity: Minimum cosine similarity threshold (default: 0.0).

        Returns:
            List of RetrievedChunk records ordered by descending similarity.
        """
        k = top_k or getattr(settings, "rag_top_k", 8)
        clean_query = query.strip()
        if not clean_query:
            return []

        try:
            # 1. Generate query embedding vector
            query_vector = self._embedding_provider.embed_query(clean_query)

            # 2. Query repository with document ownership isolation
            scored_chunks = self._chunk_repo.search_vector_similarity(
                document_id=document_id,
                query_vector=query_vector,
                top_k=k,
                min_similarity=min_similarity,
            )

            # 3. Format as structured RetrievedChunk
            results: list[RetrievedChunk] = []
            for chunk, sim in scored_chunks:
                results.append(
                    RetrievedChunk(
                        chunk_id=chunk.id,
                        chunk_index=chunk.chunk_index,
                        text=chunk.text,
                        page_start=chunk.page_start,
                        page_end=chunk.page_end,
                        page_numbers=chunk.page_numbers or [chunk.page_start],
                        similarity_score=round(sim, 4),
                        token_count=chunk.token_count,
                    )
                )
            return results

        except Exception as exc:
            logger.error("Semantic candidate retrieval failed for document %s: %s", document_id, exc)
            raise

