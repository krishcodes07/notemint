"""Tests for HybridRetrievalService, RRF scoring, and fallback (Phase 10)."""

from __future__ import annotations

import uuid
import pytest
from sqlalchemy.orm import Session
import httpx

from app.models.document import Document, DocumentStatus
from app.models.document_extraction import DocumentExtraction, DocumentPage, ExtractionStatus
from app.models.user import User
from app.services.document_indexing_service import DocumentIndexingService
from app.services.hybrid_retrieval_service import HybridRetrievalService
from app.services.teacher_context_service import TeacherContextResult


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_hybrid_test", email="hybrid@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def textbook_doc(db_session: Session, test_user: User) -> Document:
    doc = Document(
        clerk_user_id=test_user.clerk_user_id,
        original_filename="Cell_Biology.pdf",
        storage_key="test_cell_biology_retrieval.pdf",
        mime_type="application/pdf",
        file_size_bytes=40960,
        status=DocumentStatus.COMPLETED,
        page_count=5,
    )
    db_session.add(doc)
    db_session.commit()

    extraction = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=1500,
        quality={"is_scanned": False},
    )
    db_session.add(extraction)

    p1 = DocumentPage(
        document_id=doc.id,
        page_number=1,
        text="Introduction to cytology. Cells are the fundamental building blocks of all living matter on Earth.",
        has_text=True,
    )
    p2 = DocumentPage(
        document_id=doc.id,
        page_number=2,
        text="Photosynthesis occurs inside chloroplasts where solar radiation powers the reduction of CO2 into glucose.",
        has_text=True,
    )
    p3 = DocumentPage(
        document_id=doc.id,
        page_number=3,
        text="Mitochondrial respiration oxidizes organic substrates. ATP serves as the primary energy carrier and currency during cellular metabolism.",
        has_text=True,
    )
    p4 = DocumentPage(
        document_id=doc.id,
        page_number=4,
        text="Diagram on page 4 illustrates the ATP synthase complex embedded in the inner mitochondrial membrane.",
        has_text=True,
    )
    p5 = DocumentPage(
        document_id=doc.id,
        page_number=5,
        text="Cell division: mitosis ensures equal partitioning of replicated chromosomes into two daughter nuclei.",
        has_text=True,
    )
    db_session.add_all([p1, p2, p3, p4, p5])
    db_session.commit()
    return doc


class TestHybridRetrievalService:
    def test_fallback_to_keyword_retriever_when_index_unindexed(
        self, db_session: Session, textbook_doc: Document
    ) -> None:
        service = HybridRetrievalService(db_session)
        # Note: textbook_doc is not indexed yet (no DocumentIndex row exists)
        result = service.retrieve(textbook_doc.id, query="mitosis cell division")

        assert isinstance(result, TeacherContextResult)
        assert 5 in result.page_numbers
        assert "mitosis" in result.formatted_context.lower()

    def test_semantic_retrieval_finds_atp_for_energy_currency(
        self, db_session: Session, textbook_doc: Document
    ) -> None:
        # First index the document
        indexer = DocumentIndexingService(db_session)
        indexer.index_document(textbook_doc.id)

        service = HybridRetrievalService(db_session)
        # Query uses synonyms ("energy currency of a cell") rather than exact keywords
        result = service.retrieve(textbook_doc.id, query="What is the energy currency of a cell?")

        assert isinstance(result, TeacherContextResult)
        # Page 3 contains: "ATP serves as the primary energy carrier and currency during cellular metabolism"
        assert 3 in result.page_numbers
        assert "ATP" in result.formatted_context

    def test_explicit_page_reference_boost(
        self, db_session: Session, textbook_doc: Document
    ) -> None:
        indexer = DocumentIndexingService(db_session)
        indexer.index_document(textbook_doc.id)

        service = HybridRetrievalService(db_session)
        # Explicit mention of page 4
        result = service.retrieve(textbook_doc.id, query="Explain the ATP diagram on page 4")

        assert 4 in result.page_numbers
        # The top page or selected pages must contain page 4
        assert any(p.page_number == 4 and p.is_explicit_mention for p in result.selected_pages)

    def test_follow_up_query_expansion(
        self, db_session: Session, textbook_doc: Document
    ) -> None:
        indexer = DocumentIndexingService(db_session)
        indexer.index_document(textbook_doc.id)

        service = HybridRetrievalService(db_session)
        history = [
            {"role": "user", "content": "How do plants make food using chloroplasts?"},
            {"role": "assistant", "content": "Plants use photosynthesis in chloroplasts [Page 2]."},
        ]
        # Ambiguous pronoun-heavy follow up
        result = service.retrieve(
            textbook_doc.id,
            query="Why is this process essential?",
            conversation_history=history,
        )

        assert isinstance(result, TeacherContextResult)
        assert 2 in result.page_numbers

    def test_token_budget_enforcement(
        self, db_session: Session, textbook_doc: Document
    ) -> None:
        indexer = DocumentIndexingService(db_session)
        indexer.index_document(textbook_doc.id)

        service = HybridRetrievalService(db_session)
        # Low token budget (e.g. 50 tokens)
        result = service.retrieve(
            textbook_doc.id,
            query="Tell me everything about cells",
            max_tokens=60,
        )

        assert result.total_estimated_tokens <= 120
        assert len(result.selected_pages) <= 2

    def test_fallback_to_keyword_when_jina_api_fails(
        self, db_session: Session, textbook_doc: Document, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Verify Requirement 10: Preserve keyword search fallback when Jina API is unavailable."""
        indexer = DocumentIndexingService(db_session)
        indexer.index_document(textbook_doc.id)

        import app.ai.embeddings.jina_provider as jp

        class FailingJinaClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                raise httpx.ConnectError("Jina Embeddings API is unreachable")

        monkeypatch.setattr(jp.httpx, "Client", FailingJinaClient)

        service = HybridRetrievalService(db_session)
        # Should gracefully fall back to keyword search instead of failing
        result = service.retrieve(textbook_doc.id, query="mitosis cell division")
        assert isinstance(result, TeacherContextResult)
        assert 5 in result.page_numbers
        assert "mitosis" in result.formatted_context.lower()
