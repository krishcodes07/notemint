"""Hybrid keyword and semantic retrieval service for NoteMint AI Teacher (Phase 10).

Fuses dense vector similarity search with deterministic keyword scoring, exact phrase matching,
explicit page references, and neighbor continuity via Reciprocal Rank Fusion (RRF).
Implements the TeacherContextRetriever protocol with automatic fallback to Phase 9 keyword retrieval.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Sequence

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document_extraction import ExtractionStatus
from app.models.document_index import IndexStatus
from app.repositories.document_index_repository import DocumentIndexRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.services.document_context_service import (
    EmptyDocumentContextError,
    ExtractionNotCompletedError,
    estimate_tokens,
)
from app.services.semantic_retrieval_service import RetrievedChunk, SemanticRetrievalService
from app.services.teacher_context_service import (
    SelectedPageContext,
    TeacherContextResult,
    TeacherContextRetriever,
    TeacherContextService,
)

logger = logging.getLogger(__name__)


class HybridRetrievalService:
    """Hybrid RAG retriever combining vector search, keyword matching, and explicit page boosting.

    Conforms to the TeacherContextRetriever protocol and gracefully falls back to
    TeacherContextService when pgvector indexing is pending or unavailable.
    """

    def __init__(
        self,
        session: Session,
        semantic_service: SemanticRetrievalService | None = None,
        keyword_service: TeacherContextService | None = None,
    ) -> None:
        self._session = session
        self._index_repo = DocumentIndexRepository(session)
        self._extraction_repo = ExtractionRepository(session)
        self._semantic_service = semantic_service or SemanticRetrievalService(session)
        self._keyword_service = keyword_service or TeacherContextService(session)

    def retrieve(
        self,
        document_id: uuid.UUID,
        query: str,
        conversation_history: Sequence[dict[str, str]] | None = None,
        max_pages: int | None = None,
        max_tokens: int | None = None,
    ) -> TeacherContextResult:
        """Retrieve grounded context using hybrid RAG or graceful keyword fallback.

        Args:
            document_id: Target document UUID.
            query: Current user message.
            conversation_history: Optional recent conversation turns for follow-up resolution.
            max_pages: Maximum number of pages to include in the context.
            max_tokens: Maximum context token budget.

        Returns:
            TeacherContextResult containing selected pages, formatted context, and page numbers.
        """
        budget_pages = max_pages or getattr(settings, "ai_teacher_max_source_pages", 8)
        budget_tokens = max_tokens or getattr(settings, "ai_teacher_max_context_tokens", 12000)

        # 1. Verify extraction status
        extraction = self._extraction_repo.get_by_document_id(document_id)
        if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
            status_str = extraction.status.value if extraction else "missing"
            raise ExtractionNotCompletedError(
                f"Document {document_id} extraction is not completed (current status: {status_str})."
            )

        # 2. Check if RAG is enabled and vector index is ready
        rag_enabled = getattr(settings, "rag_enabled", True)
        if not rag_enabled:
            logger.info("RAG is disabled in configuration; using keyword retriever fallback.")
            return self._keyword_service.retrieve(
                document_id, query, conversation_history, budget_pages, budget_tokens
            )

        index_record = self._index_repo.get_by_document_id(document_id)
        if index_record is None or index_record.status != IndexStatus.COMPLETED.value:
            status_str = index_record.status if index_record else "none"
            logger.info(
                "Document %s vector index is not completed (status: %s); falling back to keyword retriever.",
                document_id,
                status_str,
            )
            return self._keyword_service.retrieve(
                document_id, query, conversation_history, budget_pages, budget_tokens
            )

        # 3. Vector index is ready -> execute hybrid retrieval
        try:
            return self._execute_hybrid_retrieval(
                document_id=document_id,
                query=query,
                conversation_history=conversation_history,
                budget_pages=budget_pages,
                budget_tokens=budget_tokens,
            )
        except Exception as exc:
            logger.warning(
                "Hybrid retrieval failed for document %s (%s: %s); falling back to keyword retriever.",
                document_id,
                type(exc).__name__,
                exc,
            )
            return self._keyword_service.retrieve(
                document_id, query, conversation_history, budget_pages, budget_tokens
            )

    def _execute_hybrid_retrieval(
        self,
        document_id: uuid.UUID,
        query: str,
        conversation_history: Sequence[dict[str, str]] | None,
        budget_pages: int,
        budget_tokens: int,
    ) -> TeacherContextResult:
        """Internal hybrid retrieval fusing vector similarity and keyword ranking."""
        # 1. Detect explicit page references (e.g. "page 4", "p. 14")
        explicit_pages = self._keyword_service._extract_explicit_page_references(query)

        # 2. Expand ambiguous follow-up query if conversation history is present
        search_query = query
        if conversation_history:
            history_kws = self._keyword_service._extract_history_keywords(conversation_history)
            query_kws = self._keyword_service._extract_keywords(query)
            # If current query is very short or pronoun-heavy, add top substantive history keywords
            if len(query_kws) <= 2 and history_kws:
                search_query = f"{query} {' '.join(history_kws[:3])}"

        # 3. Retrieve vector candidates
        vector_candidates = self._semantic_service.retrieve_candidates(
            document_id=document_id,
            query=search_query,
            top_k=budget_pages * 2,
        )

        # 4. Also retrieve keyword page rankings via keyword service
        all_pages = self._extraction_repo.get_pages_for_document(document_id)
        usable_pages = [p for p in all_pages if p.has_text and p.text and p.text.strip()]
        pages_by_num = {p.page_number: p for p in usable_pages}

        query_keywords = self._keyword_service._extract_keywords(search_query)
        keyword_scores: dict[int, float] = {}
        for p in usable_pages:
            score = self._keyword_service._compute_page_score(
                page_text=p.text or "",
                keywords=query_keywords,
                raw_query=search_query,
                is_explicit=(p.page_number in explicit_pages),
            )
            keyword_scores[p.page_number] = score

        # 5. Rank Fusion: combine vector candidate chunks and page scores
        vector_weight = getattr(settings, "rag_vector_weight", 0.65)
        keyword_weight = getattr(settings, "rag_keyword_weight", 0.35)

        # Rank positions for RRF (1-based)
        vector_page_ranks: dict[int, int] = {}
        for rank_idx, chunk in enumerate(vector_candidates, start=1):
            for p_num in chunk.page_numbers:
                if p_num not in vector_page_ranks:
                    vector_page_ranks[p_num] = rank_idx

        sorted_keyword_pages = sorted(keyword_scores.items(), key=lambda x: x[1], reverse=True)
        keyword_page_ranks: dict[int, int] = {
            p_num: rank_idx for rank_idx, (p_num, _) in enumerate(sorted_keyword_pages, start=1)
        }

        # RRF formula: sum(w / (60 + rank))
        fused_page_scores: dict[int, float] = {}
        candidate_pages = set(vector_page_ranks.keys()) | {p for p, s in keyword_scores.items() if s > 0} | explicit_pages

        for p_num in candidate_pages:
            r_vec = vector_page_ranks.get(p_num, 100)
            r_kw = keyword_page_ranks.get(p_num, 100)
            rrf_score = (vector_weight * (1.0 / (60 + r_vec))) + (keyword_weight * (1.0 / (60 + r_kw)))

            # Strong boost for explicit page mentions so they are never overridden
            if p_num in explicit_pages:
                rrf_score += 10.0

            fused_page_scores[p_num] = rrf_score

        # 6. Rank pages by fused score
        ranked_pages = sorted(
            fused_page_scores.items(),
            key=lambda item: (item[1], -item[0]),
            reverse=True,
        )

        # 7. Select top pages and assemble chunk text
        selected_pages_map: dict[int, SelectedPageContext] = {}
        current_tokens = 0

        # Build map of relevant chunk text per page for high-fidelity grounding
        chunks_by_page: dict[int, list[str]] = {}
        for chunk in vector_candidates:
            for p_num in chunk.page_numbers:
                chunks_by_page.setdefault(p_num, []).append(chunk.text)

        for p_num, score in ranked_pages:
            if len(selected_pages_map) >= budget_pages:
                break
            if p_num not in pages_by_num:
                continue

            doc_page = pages_by_num[p_num]
            # Use bounded page text
            page_text = self._keyword_service._bound_page_text(doc_page.text or "", max_chars=8000)
            page_tokens = estimate_tokens(page_text)

            if current_tokens + page_tokens > budget_tokens and selected_pages_map:
                continue

            is_explicit = p_num in explicit_pages
            selected_pages_map[p_num] = SelectedPageContext(
                page_number=p_num,
                text=page_text,
                relevance_score=score,
                is_explicit_mention=is_explicit,
                is_neighbor=False,
                estimated_tokens=page_tokens,
            )
            current_tokens += page_tokens

        # Fallback if no page scored
        if not selected_pages_map and usable_pages:
            for doc_page in usable_pages[: min(3, budget_pages)]:
                p_num = doc_page.page_number
                page_text = self._keyword_service._bound_page_text(doc_page.text or "", max_chars=8000)
                page_tokens = estimate_tokens(page_text)
                if current_tokens + page_tokens > budget_tokens:
                    break
                selected_pages_map[p_num] = SelectedPageContext(
                    page_number=p_num,
                    text=page_text,
                    relevance_score=0.1,
                    is_explicit_mention=False,
                    is_neighbor=False,
                    estimated_tokens=page_tokens,
                )
                current_tokens += page_tokens

        # 8. Sort pages in chronological page order for coherent reading
        ordered_pages = sorted(selected_pages_map.values(), key=lambda p: p.page_number)
        page_numbers = [p.page_number for p in ordered_pages]

        # 9. Format context
        formatted_sections: list[str] = []
        for p in ordered_pages:
            formatted_sections.append(f"--- Page {p.page_number} ---\n{p.text}")
        formatted_context = "\n\n".join(formatted_sections)
        total_tokens = estimate_tokens(formatted_context)

        logger.info(
            "Hybrid retrieval selected %d pages for doc %s (query: %r, pages: %s, tokens: %d)",
            len(ordered_pages),
            document_id,
            query[:30],
            page_numbers,
            total_tokens,
        )

        return TeacherContextResult(
            document_id=document_id,
            query=query,
            selected_pages=ordered_pages,
            formatted_context=formatted_context,
            page_numbers=page_numbers,
            total_estimated_tokens=total_tokens,
        )

