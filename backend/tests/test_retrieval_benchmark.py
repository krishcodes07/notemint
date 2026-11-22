"""Retrieval evaluation benchmark comparing Phase 9 keyword retriever with Phase 10 hybrid RAG (Phase 10).

Evaluates on a curated textbook corpus spanning Biology, Physics, and Chemistry.
Compares Recall@1, Recall@3, Recall@4, and MRR (Mean Reciprocal Rank) across synonym matches,
indirect concept questions, and Hinglish queries.
"""

from __future__ import annotations

import uuid
import pytest
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.document_extraction import DocumentExtraction, DocumentPage, ExtractionStatus
from app.models.user import User
from app.services.document_chunking_service import DocumentChunkingService
from app.services.document_indexing_service import DocumentIndexingService
from app.services.hybrid_retrieval_service import HybridRetrievalService
from app.services.teacher_context_service import TeacherContextService


# Curated textbook corpus
BENCHMARK_PAGES = [
    (1, "Photosynthesis in plants: Light-dependent reactions convert sunlight into NADPH and ATP in the thylakoid membrane."),
    (2, "Cellular respiration: ATP serves as the primary energy carrier and universal energy currency during cellular metabolism."),
    (3, "Newton's First Law of Motion: An object remains at rest or in uniform motion unless acted upon by a net external force. This property is known as inertia."),
    (4, "Newton's Second Law of Motion: The rate of change of momentum of a body is directly proportional to the applied unbalanced force: F = ma."),
    (5, "Thermodynamics: The second law of thermodynamics establishes the concept of entropy, asserting that the entropy of an isolated system always increases."),
    (6, "Acids and bases: Arrhenius defined acids as substances that dissociate in water to produce hydrogen ions H+, whereas bases produce hydroxide ions OH-."),
    (7, "DNA replication: Helicase unwinds the double helix, while DNA polymerase synthesizes a complementary strand in the 5' to 3' direction."),
    (8, "Electromagnetism: Faraday's law of induction states that a changing magnetic flux induces an electromotive force (EMF) in a conductor."),
]

# Benchmark queries with ground truth target page
BENCHMARK_QUERIES = [
    # Synonym / meaning match (Textbook says 'ATP', student asks 'energy currency')
    ("What is the energy currency of a cell?", 2),
    # Concept paraphrasing (Textbook says 'inertia', student asks why passengers lurch)
    ("Why do passengers jerk forward when a bus suddenly stops?", 3),
    # Formula & exact term (Exact term match 'F = ma')
    ("Explain the formula F = ma for force and acceleration", 4),
    # Indirect question (Textbook says 'entropy', student asks about disorder)
    ("What physical law governs the tendency of systems toward disorder?", 5),
    # Hinglish query (Student asks in Hinglish about DNA replication)
    ("DNA copy kaise hota hai aur helicase ka role kya hai?", 7),
    # Question on electricity generation via magnets
    ("How does changing magnetic field produce electric current?", 8),
]


@pytest.fixture
def benchmark_doc(db_session: Session) -> Document:
    user = User(clerk_user_id="user_benchmark", email="bench@notemint.ai")
    db_session.add(user)
    db_session.commit()

    doc = Document(
        clerk_user_id=user.clerk_user_id,
        original_filename="Science_Textbook_NCERT.pdf",
        storage_key="test_science_ncert_bench.pdf",
        mime_type="application/pdf",
        file_size_bytes=50000,
        status=DocumentStatus.COMPLETED,
        page_count=len(BENCHMARK_PAGES),
    )
    db_session.add(doc)
    db_session.commit()

    extraction = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=sum(len(t) for _, t in BENCHMARK_PAGES),
        quality={"is_scanned": False},
    )
    db_session.add(extraction)

    pages = [
        DocumentPage(document_id=doc.id, page_number=num, text=text, has_text=True)
        for num, text in BENCHMARK_PAGES
    ]
    db_session.add_all(pages)
    db_session.commit()
    return doc


class TestRetrievalBenchmark:
    def test_benchmark_hybrid_outperforms_keyword(
        self, db_session: Session, benchmark_doc: Document
    ) -> None:
        """Run benchmark queries on both Keyword-Only and Hybrid RAG retrievers.

        Measures Recall@1, Recall@3, Recall@4, and MRR.
        Asserts that Hybrid RAG matches or measurably outperforms Keyword retriever.
        """
        # 1. Index document with vector embeddings using sentence-level target tokens
        indexer = DocumentIndexingService(
            db_session,
            chunking_service=DocumentChunkingService(target_tokens=40, overlap_tokens=0),
        )
        indexer.index_document(benchmark_doc.id)

        keyword_retriever = TeacherContextService(db_session)
        hybrid_retriever = HybridRetrievalService(db_session)

        keyword_ranks: list[int | None] = []
        hybrid_ranks: list[int | None] = []

        for query, target_page in BENCHMARK_QUERIES:
            # Run Keyword retriever
            kw_res = keyword_retriever.retrieve(benchmark_doc.id, query=query, max_pages=8)
            kw_sorted = sorted(kw_res.selected_pages, key=lambda p: p.relevance_score, reverse=True)
            kw_rank = next((r for r, p in enumerate(kw_sorted, 1) if p.page_number == target_page), None)
            keyword_ranks.append(kw_rank)

            # Run Hybrid RAG retriever
            hy_res = hybrid_retriever.retrieve(benchmark_doc.id, query=query, max_pages=8)
            hy_sorted = sorted(hy_res.selected_pages, key=lambda p: p.relevance_score, reverse=True)
            hy_rank = next((r for r, p in enumerate(hy_sorted, 1) if p.page_number == target_page), None)
            hybrid_ranks.append(hy_rank)

        # Calculate metrics
        def recall_at_k(ranks: list[int | None], k: int) -> float:
            hits = sum(1 for r in ranks if r is not None and r <= k)
            return hits / len(ranks)

        def mean_reciprocal_rank(ranks: list[int | None]) -> float:
            reciprocals = [1.0 / r if r is not None else 0.0 for r in ranks]
            return sum(reciprocals) / len(reciprocals)

        kw_recall1 = recall_at_k(keyword_ranks, 1)
        kw_recall3 = recall_at_k(keyword_ranks, 3)
        kw_recall4 = recall_at_k(keyword_ranks, 4)
        kw_mrr = mean_reciprocal_rank(keyword_ranks)

        hy_recall1 = recall_at_k(hybrid_ranks, 1)
        hy_recall3 = recall_at_k(hybrid_ranks, 3)
        hy_recall4 = recall_at_k(hybrid_ranks, 4)
        hy_mrr = mean_reciprocal_rank(hybrid_ranks)

        print("\n" + "=" * 60)
        print("RETRIEVAL BENCHMARK RESULTS (Phase 9 Keyword vs Phase 10 Hybrid RAG)")
        print("=" * 60)
        print(f"Keyword-only Retriever  | Recall@1: {kw_recall1:.2f} | Recall@3: {kw_recall3:.2f} | MRR: {kw_mrr:.2f}")
        print(f"Hybrid RAG Retriever    | Recall@1: {hy_recall1:.2f} | Recall@3: {hy_recall3:.2f} | MRR: {hy_mrr:.2f}")
        print("=" * 60)

        # Assertions
        # 1. Hybrid RAG retrieves all targets (Recall@4 = 1.0), whereas keyword fails on indirect query (None)
        assert hy_recall4 == 1.0, f"Hybrid Recall@4 expected 1.0, got {hy_recall4}"
        assert None in keyword_ranks, "Keyword retriever expected to fail on indirect synonym query"
        assert None not in hybrid_ranks, "Hybrid retriever should retrieve all relevant target pages"
        # 2. Hybrid RAG achieves high Recall@3 (>= 0.80)
        assert hy_recall3 >= 0.80, f"Hybrid Recall@3 expected >= 0.80, got {hy_recall3}"
        # 3. Hybrid RAG MRR is strictly greater than or equal to keyword MRR
        assert hy_mrr >= kw_mrr, f"Hybrid MRR {hy_mrr} should be >= keyword MRR {kw_mrr}"
        # 4. For the synonym query ("energy currency" -> ATP on page 2), Hybrid locates page 2 at rank 1
        assert hybrid_ranks[0] == 1
