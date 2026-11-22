"""Semantic, boundary-aware document chunking service for NoteMint RAG (Phase 10).

Splits extracted textbook pages into coherent, token-bounded passages while
preserving original PDF page numbers, paragraph structure, and sentence integrity.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Sequence

from app.core.config import settings
from app.models.document_extraction import DocumentPage
from app.services.document_context_service import estimate_tokens

logger = logging.getLogger(__name__)

# Sentence boundary pattern (supports English .?! and Hindi Purna Viram ।)
SENTENCE_SPLIT_REGEX = re.compile(r"(?<=[.?!।])\s+")


@dataclass(frozen=True)
class ChunkData:
    """Structured representation of a document chunk before persistence."""

    chunk_index: int
    text: str
    page_start: int
    page_end: int
    page_numbers: list[int]
    token_count: int
    content_hash: str


class DocumentChunkingService:
    """Splits textbook pages into semantic chunks with page provenance and overlap."""

    def __init__(
        self,
        target_tokens: int | None = None,
        overlap_tokens: int | None = None,
        max_chunk_tokens: int | None = None,
    ) -> None:
        self.target_tokens = target_tokens or getattr(settings, "rag_chunk_target_tokens", 450)
        self.overlap_tokens = overlap_tokens or getattr(settings, "rag_chunk_overlap_tokens", 75)
        self.max_chunk_tokens = max_chunk_tokens or (self.target_tokens + 150)

    def chunk_pages(self, pages: Sequence[DocumentPage]) -> list[ChunkData]:
        """Chunk a sequence of extracted document pages.

        Args:
            pages: Sequence of DocumentPage models sorted by page_number.

        Returns:
            List of ChunkData objects with page provenance and SHA-256 hashes.
        """
        usable_pages = [p for p in pages if p.has_text and p.text and p.text.strip()]
        if not usable_pages:
            logger.info("No usable text pages to chunk.")
            return []

        # 1. Break pages into tagged paragraph units (text, page_number)
        units: list[tuple[str, int]] = []
        for p in usable_pages:
            raw_text = p.text or ""
            # Normalize whitespace while preserving paragraphs
            paragraphs = [para.strip() for para in re.split(r"\n\s*\n", raw_text) if para.strip()]
            for para in paragraphs:
                para_tokens = estimate_tokens(para)
                # If a single paragraph exceeds max chunk size, break it into sentences
                if para_tokens > self.max_chunk_tokens:
                    sentences = self._split_into_sentences(para)
                    for sent in sentences:
                        if sent.strip():
                            units.append((sent.strip(), p.page_number))
                else:
                    units.append((para, p.page_number))

        if not units:
            return []

        # 2. Assemble units into token-bounded chunks with overlap
        chunks: list[ChunkData] = []
        current_texts: list[str] = []
        current_pages: set[int] = set()
        current_tokens = 0
        chunk_idx = 0

        for unit_text, page_num in units:
            unit_tokens = estimate_tokens(unit_text)

            # If adding unit exceeds target tokens and we already have content
            if current_tokens + unit_tokens > self.target_tokens and current_texts:
                # Finalize chunk
                chunk_obj = self._create_chunk(chunk_idx, current_texts, current_pages)
                chunks.append(chunk_obj)
                chunk_idx += 1

                # Calculate overlap from the end of current_texts
                overlap_texts, overlap_pages, overlap_toks = self._extract_overlap(
                    current_texts, current_pages, self.overlap_tokens
                )
                current_texts = list(overlap_texts)
                current_pages = set(overlap_pages)
                current_tokens = overlap_toks

            current_texts.append(unit_text)
            current_pages.add(page_num)
            current_tokens += unit_tokens

        # Finalize remaining text
        if current_texts:
            chunk_obj = self._create_chunk(chunk_idx, current_texts, current_pages)
            chunks.append(chunk_obj)

        return chunks

    def _split_into_sentences(self, text: str) -> list[str]:
        """Split text at sentence boundaries."""
        sentences = SENTENCE_SPLIT_REGEX.split(text)
        result: list[str] = []
        for s in sentences:
            s_clean = s.strip()
            if not s_clean:
                continue
            # If a single sentence is still huge, break it by words
            s_toks = estimate_tokens(s_clean)
            if s_toks > self.max_chunk_tokens:
                words = s_clean.split()
                sub = ""
                for w in words:
                    cand = f"{sub} {w}".strip()
                    if estimate_tokens(cand) > self.target_tokens and sub:
                        result.append(sub)
                        sub = w
                    else:
                        sub = cand
                if sub:
                    result.append(sub)
            else:
                result.append(s_clean)
        return result

    def _extract_overlap(
        self, texts: list[str], pages: set[int], target_overlap_tokens: int
    ) -> tuple[list[str], set[int], int]:
        """Take units from the end of texts to seed the next chunk."""
        if target_overlap_tokens <= 0 or not texts:
            return [], set(), 0

        overlap: list[str] = []
        toks = 0
        # Iterate from the end backwards
        for t in reversed(texts):
            t_toks = estimate_tokens(t)
            if toks + t_toks > target_overlap_tokens and overlap:
                break
            overlap.insert(0, t)
            toks += t_toks

        # Don't overlap 100% of the chunk
        if len(overlap) >= len(texts):
            overlap = overlap[-1:] if len(overlap) > 1 else []
            toks = sum(estimate_tokens(t) for t in overlap)

        return overlap, pages, toks

    def _create_chunk(
        self, chunk_index: int, texts: list[str], pages: set[int]
    ) -> ChunkData:
        """Construct ChunkData with page start/end, sorted page numbers, and SHA-256 hash."""
        combined_text = "\n\n".join(texts).strip()
        sorted_pages = sorted(pages) if pages else [1]
        p_start = sorted_pages[0]
        p_end = sorted_pages[-1]
        tok_count = estimate_tokens(combined_text)
        content_hash = hashlib.sha256(combined_text.encode("utf-8")).hexdigest()

        return ChunkData(
            chunk_index=chunk_index,
            text=combined_text,
            page_start=p_start,
            page_end=p_end,
            page_numbers=sorted_pages,
            token_count=tok_count,
            content_hash=content_hash,
        )

