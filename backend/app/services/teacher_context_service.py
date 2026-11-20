"""Document-grounded context selection service for NoteMint AI Teacher.

Provides bounded deterministic relevance retrieval over extracted PDF pages,
enforcing token limits, source page citation fidelity, follow-up query expansion,
and clean separation for future pgvector RAG upgrade (Phase 10).
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass, field
from typing import Protocol, Sequence

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document_extraction import DocumentPage, ExtractionStatus
from app.repositories.extraction_repository import ExtractionRepository
from app.services.document_context_service import (
    EmptyDocumentContextError,
    ExtractionNotCompletedError,
    estimate_tokens,
)

logger = logging.getLogger(__name__)

# Common stop words for academic/conversational filtering (English & Hinglish)
STOP_WORDS: set[str] = {
    "a", "an", "the", "and", "or", "but", "if", "because", "as", "what",
    "which", "this", "that", "these", "those", "then", "just", "so", "than",
    "such", "both", "through", "about", "for", "is", "of", "while", "during",
    "to", "from", "in", "out", "on", "off", "over", "under", "again", "further",
    "then", "once", "here", "there", "when", "where", "why", "how", "all",
    "any", "both", "each", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "can", "will", "just", "don", "should", "now", "tell", "me", "explain",
    "describe", "give", "please", "kya", "hai", "hain", "kaise", "hota", "hoti",
    "hote", "batao", "samjhao", "aur", "ye", "yeh", "wo", "woh", "mein", "ka",
    "ki", "ke", "ko", "se", "par", "bhi", "toh", "kuch",
}


@dataclass(frozen=True)
class SelectedPageContext:
    """Structured context for a single retrieved page."""

    page_number: int
    text: str
    relevance_score: float
    is_explicit_mention: bool = False
    is_neighbor: bool = False
    estimated_tokens: int = 0


@dataclass(frozen=True)
class TeacherContextResult:
    """Complete structured context package ready for AI Teacher prompt ingestion."""

    document_id: uuid.UUID
    query: str
    selected_pages: list[SelectedPageContext]
    formatted_context: str
    page_numbers: list[int]
    total_estimated_tokens: int


class TeacherContextRetriever(Protocol):
    """Protocol for context retrieval (swappable with pgvector semantic retriever in Phase 10)."""

    def retrieve(
        self,
        document_id: uuid.UUID,
        query: str,
        conversation_history: Sequence[dict[str, str]] | None = None,
        max_pages: int | None = None,
        max_tokens: int | None = None,
    ) -> TeacherContextResult:
        ...


class TeacherContextService:
    """Deterministic keyword & continuity context retriever for AI Teacher."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._extraction_repo = ExtractionRepository(session)

    def retrieve(
        self,
        document_id: uuid.UUID,
        query: str,
        conversation_history: Sequence[dict[str, str]] | None = None,
        max_pages: int | None = None,
        max_tokens: int | None = None,
    ) -> TeacherContextResult:
        """Select relevant extracted pages for a query using deterministic scoring and continuity.

        Args:
            document_id: UUID of target document.
            query: Current student message text.
            conversation_history: Optional recent conversation messages for follow-up resolution.
            max_pages: Maximum number of pages to retrieve.
            max_tokens: Maximum token budget for assembled context.

        Returns:
            TeacherContextResult containing selected pages, formatted context, and metadata.
        """
        budget_pages = max_pages or settings.ai_teacher_max_source_pages
        budget_tokens = max_tokens or settings.ai_teacher_max_context_tokens

        # 1. Verify extraction status
        extraction = self._extraction_repo.get_by_document_id(document_id)
        if extraction is None or extraction.status != ExtractionStatus.COMPLETED:
            status_str = extraction.status.value if extraction else "missing"
            raise ExtractionNotCompletedError(
                f"Document {document_id} extraction is not completed (current status: {status_str})."
            )

        # 2. Retrieve extracted pages
        pages = self._extraction_repo.get_pages_for_document(document_id)
        if not pages:
            raise EmptyDocumentContextError(
                f"Document {document_id} has 0 extracted pages stored in the database."
            )

        usable_pages = [p for p in pages if p.has_text and p.text and p.text.strip()]
        if not usable_pages:
            raise EmptyDocumentContextError(
                f"Document {document_id} has no usable text across its pages."
            )

        # 3. Detect explicit page references (e.g. "page 4", "p. 5", "page 12")
        explicit_pages = self._extract_explicit_page_references(query)

        # 4. Tokenize and resolve keywords (including follow-up context)
        keywords = self._extract_keywords(query)
        if conversation_history:
            followup_keywords = self._extract_history_keywords(conversation_history)
            keywords = list(dict.fromkeys(keywords + followup_keywords))

        # 5. Score pages deterministically
        page_scores: dict[int, tuple[float, DocumentPage, bool]] = {}
        for p in usable_pages:
            p_num = p.page_number
            is_explicit = p_num in explicit_pages
            score = self._compute_page_score(
                page_text=p.text or "",
                keywords=keywords,
                raw_query=query,
                is_explicit=is_explicit,
            )
            page_scores[p_num] = (score, p, is_explicit)

        # 6. Rank pages by score
        ranked_pages = sorted(
            page_scores.items(),
            key=lambda item: (item[1][0], -item[0]),
            reverse=True,
        )

        # 7. Select top pages and include neighbor continuity within budgets
        selected_pages_map: dict[int, SelectedPageContext] = {}
        current_tokens = 0

        # Pass 1: Select top-scoring pages
        for p_num, (score, doc_page, is_explicit) in ranked_pages:
            if len(selected_pages_map) >= budget_pages:
                break
            if score <= 0.0 and not is_explicit and selected_pages_map:
                # If we already have relevant pages and remaining pages have 0 score, stop
                break

            page_text = self._bound_page_text(doc_page.text or "", max_chars=8000)
            page_tokens = estimate_tokens(page_text)

            if current_tokens + page_tokens > budget_tokens and selected_pages_map:
                # Budget exceeded; check if we can fit partial or break
                continue

            selected_pages_map[p_num] = SelectedPageContext(
                page_number=p_num,
                text=page_text,
                relevance_score=score,
                is_explicit_mention=is_explicit,
                is_neighbor=False,
                estimated_tokens=page_tokens,
            )
            current_tokens += page_tokens

        # If no page scored positively (e.g. query has only stopwords or generic question),
        # include the first few pages of the document as fallback context
        if not selected_pages_map:
            for doc_page in usable_pages[: min(3, budget_pages)]:
                p_num = doc_page.page_number
                page_text = self._bound_page_text(doc_page.text or "", max_chars=8000)
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

        # Pass 2: Continuity neighbor check
        # If page N is selected, check if N+1 or N-1 can provide continuity if budget allows
        all_pages_by_num = {p.page_number: p for p in usable_pages}
        initial_selected_nums = list(selected_pages_map.keys())

        for p_num in initial_selected_nums:
            if len(selected_pages_map) >= budget_pages:
                break
            for neighbor_num in (p_num + 1, p_num - 1):
                if (
                    neighbor_num in all_pages_by_num
                    and neighbor_num not in selected_pages_map
                    and len(selected_pages_map) < budget_pages
                ):
                    n_page = all_pages_by_num[neighbor_num]
                    n_text = self._bound_page_text(n_page.text or "", max_chars=6000)
                    n_tokens = estimate_tokens(n_text)
                    if current_tokens + n_tokens <= budget_tokens:
                        selected_pages_map[neighbor_num] = SelectedPageContext(
                            page_number=neighbor_num,
                            text=n_text,
                            relevance_score=page_scores.get(neighbor_num, (0.0,))[0] + 1.0,
                            is_explicit_mention=False,
                            is_neighbor=True,
                            estimated_tokens=n_tokens,
                        )
                        current_tokens += n_tokens

        # 8. Order selected pages by ascending page number for coherent reading
        ordered_pages = sorted(selected_pages_map.values(), key=lambda p: p.page_number)
        page_numbers = [p.page_number for p in ordered_pages]

        # 9. Format context
        formatted_sections: list[str] = []
        for p in ordered_pages:
            formatted_sections.append(f"--- Page {p.page_number} ---\n{p.text}")
        formatted_context = "\n\n".join(formatted_sections)

        total_tokens = estimate_tokens(formatted_context)

        return TeacherContextResult(
            document_id=document_id,
            query=query,
            selected_pages=ordered_pages,
            formatted_context=formatted_context,
            page_numbers=page_numbers,
            total_estimated_tokens=total_tokens,
        )

    def _extract_explicit_page_references(self, query: str) -> set[int]:
        """Detect explicit page numbers mentioned by the user in their prompt."""
        matches = re.findall(r"\b(?:page|pg\.?|p\.?)\s*[:#]?\s*(\d+)\b", query, re.IGNORECASE)
        explicit: set[int] = set()
        for m in matches:
            try:
                num = int(m)
                if num > 0:
                    explicit.add(num)
            except ValueError:
                continue
        return explicit

    def _extract_keywords(self, text: str) -> list[str]:
        """Normalize and tokenize meaningful search keywords from query."""
        cleaned = re.sub(r"[^\w\s]", " ", text.lower())
        tokens = cleaned.split()
        keywords = [t for t in tokens if len(t) >= 2 and t not in STOP_WORDS]
        return keywords

    def _extract_history_keywords(
        self, conversation_history: Sequence[dict[str, str]]
    ) -> list[str]:
        """Extract substantive keywords from recent conversation turns for follow-up questions."""
        history_keywords: list[str] = []
        # Inspect last 2 turns
        recent_turns = conversation_history[-3:] if len(conversation_history) > 3 else conversation_history
        for turn in recent_turns:
            content = turn.get("content", "")
            if content:
                kws = self._extract_keywords(content)
                # Keep words with >= 4 characters to focus on substantive concepts
                history_keywords.extend([k for k in kws if len(k) >= 4])
        return history_keywords[:6]

    def _compute_page_score(
        self,
        page_text: str,
        keywords: list[str],
        raw_query: str,
        is_explicit: bool,
    ) -> float:
        """Compute deterministic relevance score for a page."""
        score = 0.0
        text_lower = page_text.lower()

        # Explicit page mention receives strong priority boost
        if is_explicit:
            score += 100.0

        # Exact phrase match bonus (phrases of 2+ words from query)
        query_words = [w for w in re.sub(r"[^\w\s]", " ", raw_query.lower()).split() if len(w) >= 3 and w not in STOP_WORDS]
        if len(query_words) >= 2:
            query_phrase = " ".join(query_words[:4])
            if query_phrase in text_lower:
                score += 25.0

        # Keyword matching
        matched_keywords = 0
        for kw in keywords:
            count = text_lower.count(kw)
            if count > 0:
                matched_keywords += 1
                # Sublinear term frequency weighting
                tf_score = min(count, 5) * 2.0
                score += tf_score

                # Bonus if keyword appears in top 200 characters (heading or title area)
                if kw in text_lower[:250]:
                    score += 4.0

        # Keyword coverage bonus (percentage of unique query keywords matched)
        if keywords:
            coverage = matched_keywords / len(keywords)
            score += coverage * 15.0

        return score

    def _bound_page_text(self, text: str, max_chars: int = 8000) -> str:
        """Ensure an unusually long page cannot exhaust the model context window."""
        trimmed = text.strip()
        if len(trimmed) <= max_chars:
            return trimmed
        return trimmed[:max_chars] + "\n...[truncated for length]..."

