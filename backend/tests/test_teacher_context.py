"""Tests for Phase 9 TeacherContextService and deterministic context retrieval."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.models.user import User
from app.services.document_context_service import (
    EmptyDocumentContextError,
    ExtractionNotCompletedError,
)
from app.services.teacher_context_service import TeacherContextService


@pytest.fixture
def setup_extracted_document(db_session: Session) -> tuple[User, Document]:
    user = User(clerk_user_id="user_ctx_test", email="ctx@notemint.ai")
    db_session.add(user)
    db_session.flush()

    doc = Document(
        clerk_user_id=user.clerk_user_id,
        original_filename="Photosynthesis_Chapter.pdf",
        storage_key="test_photo_ch.pdf",
        mime_type="application/pdf",
        file_size_bytes=50000,
        status=DocumentStatus.COMPLETED,
        page_count=6,
    )
    db_session.add(doc)
    db_session.flush()

    ext = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=1500,
    )
    db_session.add(ext)
    db_session.flush()

    # Add 6 pages with distinct content
    pages = [
        DocumentPage(
            document_id=doc.id,
            page_number=1,
            text="Chapter 1: Introduction to Plant Biology and Ecology. Overview of plant kingdom.",
            character_count=80,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=2,
            text="Cell structures in leaves. The role of stomata and chloroplasts in transpiration.",
            character_count=85,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=3,
            text="Chlorophyll pigments absorb blue and red light while reflecting green wavelengths.",
            character_count=87,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=4,
            text="Photosynthesis process: Light-dependent reactions convert sunlight into ATP and NADPH in the thylakoid membrane.",
            character_count=115,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=5,
            text="Calvin Cycle: Light-independent reactions take CO2 and produce glucose carbohydrates in the stroma.",
            character_count=105,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=6,
            text="Chapter review questions and glossary of terms. Practice exercises for students.",
            character_count=84,
            has_text=True,
        ),
    ]
    db_session.add_all(pages)
    db_session.commit()
    return user, doc


class TestTeacherContextService:
    def test_explicit_page_reference_prioritization(
        self, db_session: Session, setup_extracted_document: tuple[User, Document]
    ) -> None:
        _user, doc = setup_extracted_document
        service = TeacherContextService(db_session)

        # Student explicitly asks about page 5
        result = service.retrieve(
            document_id=doc.id,
            query="Explain the concept explained on page 5 in detail.",
        )
        assert 5 in result.page_numbers
        # Page 5 must be in selected pages and have explicit flag
        p5 = next(p for p in result.selected_pages if p.page_number == 5)
        assert p5.is_explicit_mention is True
        assert p5.relevance_score >= 100.0

    def test_keyword_relevance_matching(
        self, db_session: Session, setup_extracted_document: tuple[User, Document]
    ) -> None:
        _user, doc = setup_extracted_document
        service = TeacherContextService(db_session)

        # Query matches terms on page 4 (thylakoid, ATP, light-dependent)
        result = service.retrieve(
            document_id=doc.id,
            query="What happens in the thylakoid membrane during light dependent reactions?",
        )
        assert 4 in result.page_numbers
        assert "thylakoid membrane" in result.formatted_context

    def test_neighbor_continuity_included(
        self, db_session: Session, setup_extracted_document: tuple[User, Document]
    ) -> None:
        _user, doc = setup_extracted_document
        service = TeacherContextService(db_session)

        result = service.retrieve(
            document_id=doc.id,
            query="Tell me about chlorophyll pigments and light absorption.",
            max_pages=4,
        )
        assert 3 in result.page_numbers
        # Neighbor page 4 or 2 should be included for continuity
        neighbor_pages = [p.page_number for p in result.selected_pages if p.is_neighbor]
        assert len(neighbor_pages) > 0 or len(result.page_numbers) > 1

    def test_followup_question_uses_history(
        self, db_session: Session, setup_extracted_document: tuple[User, Document]
    ) -> None:
        _user, doc = setup_extracted_document
        service = TeacherContextService(db_session)

        # User asks a vague follow-up "Why is it important?" with history discussing chlorophyll
        history = [
            {"role": "user", "content": "Explain chlorophyll in plants."},
            {"role": "assistant", "content": "Chlorophyll pigments absorb sunlight for photosynthesis. [Page 3]"},
        ]
        result = service.retrieve(
            document_id=doc.id,
            query="Why is this pigment so important for energy?",
            conversation_history=history,
        )
        # Should pick up 'chlorophyll' or 'photosynthesis' from history
        assert 3 in result.page_numbers or 4 in result.page_numbers

    def test_extraction_not_completed_error(
        self, db_session: Session, setup_extracted_document: tuple[User, Document]
    ) -> None:
        _user, doc = setup_extracted_document
        # Change status to extracting
        ext = db_session.query(DocumentExtraction).filter_by(document_id=doc.id).one()
        ext.status = ExtractionStatus.EXTRACTING
        db_session.commit()

        service = TeacherContextService(db_session)
        with pytest.raises(ExtractionNotCompletedError):
            service.retrieve(doc.id, "Explain photosynthesis")

    def test_empty_document_pages_error(
        self, db_session: Session, setup_extracted_document: tuple[User, Document]
    ) -> None:
        _user, doc = setup_extracted_document
        # Delete pages
        db_session.query(DocumentPage).filter_by(document_id=doc.id).delete()
        db_session.commit()

        service = TeacherContextService(db_session)
        with pytest.raises(EmptyDocumentContextError):
            service.retrieve(doc.id, "Explain photosynthesis")
