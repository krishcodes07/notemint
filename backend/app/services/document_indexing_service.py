"""Document vector indexing service managing chunking and embedding pipelines (Phase 10)."""

from __future__ import annotations

import logging
import uuid
from typing import Sequence

from sqlalchemy.orm import Session

from app.ai.embeddings.base import BaseEmbeddingProvider
from app.ai.embeddings.provider_factory import get_embedding_provider
from app.core.config import settings
from app.models.document_chunk import DocumentChunk
from app.models.document_extraction import ExtractionStatus
from app.models.document_index import DocumentIndex, IndexStatus
from app.repositories.document_chunk_repository import DocumentChunkRepository
from app.repositories.document_index_repository import DocumentIndexRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.services.document_chunking_service import ChunkData, DocumentChunkingService

logger = logging.getLogger(__name__)


class DocumentIndexingError(Exception):
    """Base exception for document indexing failures."""


class DocumentIndexingService:
    """Coordinates semantic chunking, vector embedding generation, and atomic persistence."""

    def __init__(
        self,
        session: Session,
        embedding_provider: BaseEmbeddingProvider | None = None,
        chunking_service: DocumentChunkingService | None = None,
    ) -> None:
        self._session = session
        self._doc_repo = DocumentRepository(session)
        self._extraction_repo = ExtractionRepository(session)
        self._chunk_repo = DocumentChunkRepository(session)
        self._index_repo = DocumentIndexRepository(session)
        self._embedding_provider = embedding_provider or get_embedding_provider()
        self._chunking_service = chunking_service or DocumentChunkingService()

    def index_document(self, document_id: uuid.UUID, force: bool = False) -> DocumentIndex:
        """Generate chunks and vector embeddings for an extracted document.

        Args:
            document_id: Target document UUID.
            force: If True, re-index even if an index is already marked completed.

        Returns:
            Updated DocumentIndex record.
        """
        # 1. Verify document exists
        doc = self._doc_repo.get_by_id_unscoped(document_id)
        if doc is None:
            raise DocumentIndexingError(f"Document {document_id} not found.")

        # 2. Verify extraction completed
        extraction = self._extraction_repo.get_by_document_id(document_id)
        if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
            status_str = extraction.status.value if extraction else "missing"
            raise DocumentIndexingError(
                f"Cannot index document {document_id}: extraction status is '{status_str}'."
            )

        # 3. Check existing index
        existing_index = self._index_repo.get_by_document_id(document_id)
        if (
            existing_index
            and existing_index.status == IndexStatus.COMPLETED.value
            and not force
            and existing_index.embedding_model == self._embedding_provider.model_name
            and existing_index.embedding_dimensions == self._embedding_provider.dimensions
        ):
            logger.info("Document %s already indexed with model %s (%d-d); skipping.", document_id, existing_index.embedding_model, existing_index.embedding_dimensions)
            return existing_index

        # 4. Fetch extracted pages
        pages = self._extraction_repo.get_pages_for_document(document_id)
        usable_pages = [p for p in pages if p.has_text and p.text and p.text.strip()]
        if not usable_pages:
            logger.info("Document %s has no usable text to index.", document_id)
            return self._index_repo.create_or_update_index(
                document_id=document_id,
                status=IndexStatus.COMPLETED.value,
                embedding_provider=self._embedding_provider.provider_name,
                embedding_model=self._embedding_provider.model_name,
                embedding_dimensions=self._embedding_provider.dimensions,
                chunk_count=0,
            )

        # 5. Mark index status as INDEXING
        self._index_repo.mark_indexing(
            document_id=document_id,
            embedding_provider=self._embedding_provider.provider_name,
            embedding_model=self._embedding_provider.model_name,
            embedding_dimensions=self._embedding_provider.dimensions,
        )
        self._session.commit()

        try:
            # 6. Generate semantic chunks
            chunks_data = self._chunking_service.chunk_pages(usable_pages)
            if not chunks_data:
                logger.info("Chunking produced 0 chunks for document %s", document_id)
                idx = self._index_repo.mark_completed(
                    document_id=document_id,
                    embedding_provider=self._embedding_provider.provider_name,
                    embedding_model=self._embedding_provider.model_name,
                    embedding_dimensions=self._embedding_provider.dimensions,
                    chunk_count=0,
                )
                self._session.commit()
                return idx

            # 7. Generate embeddings in bounded batches
            texts = [c.text for c in chunks_data]
            embeddings = self._embedding_provider.embed_documents(texts)

            if len(embeddings) != len(chunks_data):
                raise DocumentIndexingError(
                    f"Generated {len(embeddings)} embeddings for {len(chunks_data)} chunks."
                )

            # 8. Persist chunks atomically
            # Delete old chunks only right before inserting new ones
            self._chunk_repo.delete_chunks_for_document(document_id)

            chunk_models: list[DocumentChunk] = []
            for c_data, emb in zip(chunks_data, embeddings):
                chunk_model = DocumentChunk(
                    document_id=document_id,
                    chunk_index=c_data.chunk_index,
                    text=c_data.text,
                    page_start=c_data.page_start,
                    page_end=c_data.page_end,
                    page_numbers=c_data.page_numbers,
                    token_count=c_data.token_count,
                    content_hash=c_data.content_hash,
                    embedding=emb,
                    embedding_model=self._embedding_provider.model_name,
                )
                chunk_models.append(chunk_model)

            self._chunk_repo.create_chunks(chunk_models)

            # 9. Mark index completed
            idx = self._index_repo.mark_completed(
                document_id=document_id,
                embedding_provider=self._embedding_provider.provider_name,
                embedding_model=self._embedding_provider.model_name,
                embedding_dimensions=self._embedding_provider.dimensions,
                chunk_count=len(chunk_models),
            )
            self._session.commit()
            logger.info("Document %s indexed successfully with %d chunks.", document_id, len(chunk_models))
            return idx

        except Exception as exc:
            logger.exception("Document indexing failed for document %s: %s", document_id, exc)
            self._session.rollback()
            failed_idx = self._index_repo.mark_failed(
                document_id=document_id,
                error_message=str(exc),
                embedding_provider=self._embedding_provider.provider_name,
                embedding_model=self._embedding_provider.model_name,
                embedding_dimensions=self._embedding_provider.dimensions,
            )
            self._session.commit()
            raise DocumentIndexingError(f"Indexing failed for document {document_id}: {exc}") from exc

