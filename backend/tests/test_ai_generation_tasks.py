"""Tests for background AI generation tasks and service execution."""

from __future__ import annotations

import uuid
from typing import Iterator
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.ai.base import (
    AIAuthenticationError,
    AICompletionResult,
    AIRateLimitError,
)
from app.db.base import Base
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)
from app.models.user import User
from app.repositories.study_resource_repository import StudyResourceRepository
from app.services.ai_generation_service import AIGenerationService
from app.tasks.ai_generation_tasks import generate_study_resource_task


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def ready_doc(db_session: Session) -> tuple[Document, StudyResource]:
    user = User(clerk_user_id="user_task_test")
    db_session.add(user)
    db_session.flush()

    doc = Document(
        id=uuid.uuid4(),
        clerk_user_id="user_task_test",
        original_filename="sample.pdf",
        storage_key="k_sample",
        mime_type="application/pdf",
        file_size_bytes=1000,
        status=DocumentStatus.GENERATING,
    )
    db_session.add(doc)

    ext = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=500,
    )
    db_session.add(ext)

    page = DocumentPage(
        document_id=doc.id,
        page_number=1,
        text="Light energy is converted into glucose via photosynthesis inside chloroplasts.",
        character_count=80,
        has_text=True,
    )
    db_session.add(page)

    res = StudyResource(
        id=uuid.uuid4(),
        document_id=doc.id,
        resource_type=ResourceType.NOTES,
        model_name="kilo-auto/free",
        status=ResourceStatus.PENDING,
        version=1,
        is_active=True,
    )
    db_session.add(res)
    db_session.commit()
    return doc, res


class TestAIGenerationServiceAndTasks:
    def test_service_generates_and_activates_notes(
        self, db_session: Session, ready_doc: tuple[Document, StudyResource]
    ) -> None:
        doc, res = ready_doc
        mock_provider = MagicMock()
        mock_provider.generate.return_value = AICompletionResult(
            content="""{
              "title": "Photosynthesis Notes",
              "overview": "Overview of plant energy conversion.",
              "sections": [
                {
                  "heading": "Light Reactions",
                  "content": "Photons excite electrons in chlorophyll.",
                  "key_points": ["Chlorophyll absorbs light"],
                  "source_pages": [1]
                }
              ],
              "key_terms": [
                {
                  "term": "Chloroplast",
                  "definition": "Site of photosynthesis",
                  "source_pages": [1]
                }
              ]
            }""",
            model="kilo-auto/free",
            input_tokens=150,
            output_tokens=80,
            total_tokens=230,
        )

        service = AIGenerationService(session=db_session, provider=mock_provider)
        completed_res = service.generate_single_resource(
            document_id=doc.id,
            resource_type=ResourceType.NOTES,
            resource_id=res.id,
        )

        assert completed_res.status == ResourceStatus.COMPLETED
        assert completed_res.content is not None
        assert completed_res.content["title"] == "Photosynthesis Notes"
        assert completed_res.input_tokens == 150
        assert completed_res.output_tokens == 80
        assert completed_res.is_active is True

    @patch("app.tasks.ai_generation_tasks.get_ai_provider")
    @patch("app.tasks.ai_generation_tasks.get_session_factory")
    def test_task_permanent_error_marks_resource_failed(
        self,
        mock_session_factory: MagicMock,
        mock_get_provider: MagicMock,
        db_session: Session,
        ready_doc: tuple[Document, StudyResource],
    ) -> None:
        doc, res = ready_doc
        doc_id_str = str(doc.id)
        res_type_str = res.resource_type.value
        res_id = res.id

        mock_session_factory.return_value = lambda: db_session

        mock_provider = MagicMock()
        mock_provider.generate.side_effect = AIAuthenticationError("Invalid API key", status_code=401)
        mock_get_provider.return_value = mock_provider

        result = generate_study_resource_task(
            document_id_str=doc_id_str,
            resource_type_str=res_type_str,
            resource_id_str=str(res_id),
        )

        assert result["status"] == "failed"
        assert result["permanent"] is True

        # Check DB status is FAILED
        repo = StudyResourceRepository(db_session)
        updated_res = repo.get_by_id(res_id)
        assert updated_res is not None
        assert updated_res.status == ResourceStatus.FAILED
        assert "Invalid API key" in str(updated_res.error_message)
