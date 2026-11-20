"""Document context preparation service for AI study resource generation."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Sequence

from sqlalchemy.orm import Session

from app.models.document_extraction import DocumentPage, ExtractionStatus
from app.repositories.extraction_repository import ExtractionRepository

logger = logging.getLogger(__name__)


class DocumentContextError(Exception):
    """Base error for document context preparation."""


class ExtractionNotCompletedError(DocumentContextError):
    """Document extraction has not completed successfully."""


class EmptyDocumentContextError(DocumentContextError):
    """Document has no extracted text content across its pages."""


@dataclass(frozen=True)
class DocumentChunk:
    """A bounded slice of consecutive document pages."""

    chunk_index: int
    start_page: int
    end_page: int
    page_numbers: list[int]
    formatted_text: str
    estimated_tokens: int


@dataclass(frozen=True)
class DocumentContext:
    """Prepared context ready for AI prompt ingestion."""

    document_id: uuid.UUID
    total_pages: int
    valid_page_count: int
    min_page: int
    max_page: int
    total_characters: int
    estimated_tokens: int
    formatted_text: str
    is_multi_chunk: bool
    chunks: list[DocumentChunk]


def estimate_tokens(text: str) -> int:
    """Estimate token count for text using standard ~4 characters per token heuristic.

    This provides a fast, deterministic, non-external estimation compatible
    with modern transformer tokenizers (OpenAI, Anthropic, LLaMA).
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


class DocumentContextService:
    """Service to load, validate, chunk, and format extracted document pages for AI generation."""

    def __init__(self, session: Session, default_max_context_tokens: int = 16000) -> None:
        self._session = session
        self._extraction_repo = ExtractionRepository(session)
        self.default_max_context_tokens = default_max_context_tokens

    def prepare_context(
        self,
        document_id: uuid.UUID,
        max_context_tokens: int | None = None,
    ) -> DocumentContext:
        """Load and normalize extracted pages into a grounded, bounded context.

        Args:
            document_id: UUID of the target document.
            max_context_tokens: Optional token boundary; defaults to service default.

        Returns:
            DocumentContext object with formatted text and chunks.

        Raises:
            ExtractionNotCompletedError: If extraction record is missing or not completed.
            EmptyDocumentContextError: If no usable text exists.
        """
        max_tokens = max_context_tokens or self.default_max_context_tokens

        # Verify extraction status
        extraction = self._extraction_repo.get_by_document_id(document_id)
        if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
            status_str = extraction.status.value if extraction else "missing"
            raise ExtractionNotCompletedError(
                f"Document {document_id} extraction is not completed (current status: {status_str}). "
                "Extraction must succeed before AI generation can run."
            )

        # Retrieve pages
        pages = self._extraction_repo.get_pages_for_document(document_id)
        if not pages:
            raise EmptyDocumentContextError(
                f"Document {document_id} has 0 extracted pages stored in the database."
            )

        # Filter out empty or whitespace-only pages while preserving original 1-based page numbers
        usable_pages: list[DocumentPage] = [
            p for p in pages if p.has_text and p.text and p.text.strip()
        ]
        if not usable_pages:
            raise EmptyDocumentContextError(
                f"Document {document_id} has no usable text across its {len(pages)} pages."
            )

        total_chars = sum(len(p.text) for p in usable_pages)
        total_tokens = sum(estimate_tokens(p.text) for p in usable_pages)
        min_page = min(p.page_number for p in usable_pages)
        max_page = max(p.page_number for p in usable_pages)

        # If document fits within max_tokens, build single-context output
        if total_tokens <= max_tokens:
            formatted = self._format_page_list(usable_pages)
            chunk = DocumentChunk(
                chunk_index=0,
                start_page=min_page,
                end_page=max_page,
                page_numbers=[p.page_number for p in usable_pages],
                formatted_text=formatted,
                estimated_tokens=estimate_tokens(formatted),
            )
            return DocumentContext(
                document_id=document_id,
                total_pages=len(pages),
                valid_page_count=len(usable_pages),
                min_page=min_page,
                max_page=max_page,
                total_characters=total_chars,
                estimated_tokens=total_tokens,
                formatted_text=formatted,
                is_multi_chunk=False,
                chunks=[chunk],
            )

        # Otherwise, partition into overlapping chunks bounded by max_tokens // 2
        chunk_token_limit = max(50, max_tokens // 2)
        chunks = self._build_chunks(usable_pages, chunk_token_limit)

        # Combined formatted text for prompt (or primary chunk)
        formatted_primary = self._format_page_list(usable_pages)
        # If over limit, truncate cleanly at page boundaries up to max_tokens
        if estimate_tokens(formatted_primary) > max_tokens:
            truncated_pages: list[DocumentPage] = []
            accumulated = 0
            for p in usable_pages:
                t = estimate_tokens(p.text)
                if accumulated + t > max_tokens and truncated_pages:
                    break
                truncated_pages.append(p)
                accumulated += t
            formatted_primary = self._format_page_list(truncated_pages)

        return DocumentContext(
            document_id=document_id,
            total_pages=len(pages),
            valid_page_count=len(usable_pages),
            min_page=min_page,
            max_page=max_page,
            total_characters=total_chars,
            estimated_tokens=total_tokens,
            formatted_text=formatted_primary,
            is_multi_chunk=True,
            chunks=chunks,
        )

    def _format_page_list(self, pages: Sequence[DocumentPage]) -> str:
        """Format a sequence of pages with unambiguous [Page X] tags for citation."""
        parts: list[str] = []
        for page in pages:
            parts.append(f"[Page {page.page_number}]\n{page.text.strip()}\n")
        return "\n".join(parts)

    def _build_chunks(
        self, pages: list[DocumentPage], max_chunk_tokens: int
    ) -> list[DocumentChunk]:
        """Group pages into bounded chunks with 1-page overlap for continuity."""
        chunks: list[DocumentChunk] = []
        current_pages: list[DocumentPage] = []
        current_tokens = 0
        chunk_idx = 0

        i = 0
        while i < len(pages):
            p = pages[i]
            p_tokens = estimate_tokens(p.text)

            # If single page exceeds chunk limit, include it solo
            if not current_pages and p_tokens >= max_chunk_tokens:
                formatted = self._format_page_list([p])
                chunks.append(
                    DocumentChunk(
                        chunk_index=chunk_idx,
                        start_page=p.page_number,
                        end_page=p.page_number,
                        page_numbers=[p.page_number],
                        formatted_text=formatted,
                        estimated_tokens=estimate_tokens(formatted),
                    )
                )
                chunk_idx += 1
                i += 1
                continue

            if current_tokens + p_tokens > max_chunk_tokens and current_pages:
                formatted = self._format_page_list(current_pages)
                chunks.append(
                    DocumentChunk(
                        chunk_index=chunk_idx,
                        start_page=current_pages[0].page_number,
                        end_page=current_pages[-1].page_number,
                        page_numbers=[cp.page_number for cp in current_pages],
                        formatted_text=formatted,
                        estimated_tokens=estimate_tokens(formatted),
                    )
                )
                chunk_idx += 1
                # Include 1-page overlap if budget allows, else start fresh with p
                overlap_page = current_pages[-1]
                overlap_tokens = estimate_tokens(overlap_page.text)
                if overlap_tokens + p_tokens <= max_chunk_tokens:
                    current_pages = [overlap_page, p]
                    current_tokens = overlap_tokens + p_tokens
                else:
                    current_pages = [p]
                    current_tokens = p_tokens
                i += 1
            else:
                current_pages.append(p)
                current_tokens += p_tokens
                i += 1

        if current_pages:
            formatted = self._format_page_list(current_pages)
            chunks.append(
                DocumentChunk(
                    chunk_index=chunk_idx,
                    start_page=current_pages[0].page_number,
                    end_page=current_pages[-1].page_number,
                    page_numbers=[cp.page_number for cp in current_pages],
                    formatted_text=formatted,
                    estimated_tokens=estimate_tokens(formatted),
                )
            )

        return chunks
