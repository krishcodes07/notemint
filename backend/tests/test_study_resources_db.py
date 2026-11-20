"""Database tests for StudyResource model and repository operations."""

from __future__ import annotations

import uuid
from typing import Iterator

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.document import Document, DocumentStatus
from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)
from app.models.user import User
from app.repositories.study_resource_repository import StudyResourceRepository


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
def sample_document(db_session: Session) -> Document:
    user = User(clerk_user_id="user_res_test")
    db_session.add(user)
    db_session.flush()

    doc = Document(
        id=uuid.uuid4(),
        clerk_user_id="user_res_test",
        original_filename="notes.pdf",
        storage_key="users/user_res_test/notes.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        status=DocumentStatus.COMPLETED,
    )
    db_session.add(doc)
    db_session.commit()
    return doc


class TestStudyResourceRepository:
    def test_create_and_retrieve_resource(
        self, db_session: Session, sample_document: Document
    ) -> None:
        repo = StudyResourceRepository(db_session)
        resource = repo.create(
            document_id=sample_document.id,
            resource_type=ResourceType.NOTES,
            model_name="kilo-auto/free",
            content={"title": "Test Notes", "overview": "Sample"},
            status=ResourceStatus.COMPLETED,
            is_active=True,
            version=1,
            input_tokens=100,
            output_tokens=50,
        )
        db_session.commit()

        retrieved = repo.get_by_id(resource.id)
        assert retrieved is not None
        assert retrieved.resource_type == ResourceType.NOTES
        assert retrieved.status == ResourceStatus.COMPLETED
        assert retrieved.content == {"title": "Test Notes", "overview": "Sample"}
        assert retrieved.is_active is True
        assert retrieved.version == 1

    def test_regeneration_preserves_old_resource_until_successful(
        self, db_session: Session, sample_document: Document
    ) -> None:
        repo = StudyResourceRepository(db_session)

        # 1. First successful version (v1)
        v1 = repo.create(
            document_id=sample_document.id,
            resource_type=ResourceType.FLASHCARDS,
            model_name="kilo-auto/free",
            content={"cards": [{"front": "Q1", "back": "A1"}]},
            status=ResourceStatus.COMPLETED,
            is_active=True,
            version=1,
        )
        db_session.commit()

        # 2. Start regeneration (v2), initially pending and NOT active
        v2 = repo.create(
            document_id=sample_document.id,
            resource_type=ResourceType.FLASHCARDS,
            model_name="kilo-auto/free",
            status=ResourceStatus.GENERATING,
            is_active=False,
            version=2,
        )
        db_session.commit()

        # While v2 is generating, get_active_by_type still returns v1
        active = repo.get_active_by_type(sample_document.id, ResourceType.FLASHCARDS)
        assert active is not None
        assert active.id == v1.id
        assert active.version == 1

        # 3. If v2 fails: mark failed
        repo.mark_failed(v2.id, "Provider timeout")
        db_session.commit()

        # Active resource is STILL v1! The student never loses their flashcards!
        active_after_fail = repo.get_active_by_type(sample_document.id, ResourceType.FLASHCARDS)
        assert active_after_fail is not None
        assert active_after_fail.id == v1.id

        # 4. Now retry with v3 and activate on success
        v3 = repo.create(
            document_id=sample_document.id,
            resource_type=ResourceType.FLASHCARDS,
            model_name="kilo-auto/free",
            status=ResourceStatus.GENERATING,
            is_active=False,
            version=3,
        )
        db_session.commit()

        # Activate v3 on success
        repo.activate_successful_resource(
            v3.id,
            content={"cards": [{"front": "New Q", "back": "New A"}]},
            input_tokens=150,
            output_tokens=80,
        )
        db_session.commit()

        # Now active resource is v3, and v1 is deactivated
        active_now = repo.get_active_by_type(sample_document.id, ResourceType.FLASHCARDS)
        assert active_now is not None
        assert active_now.id == v3.id
        assert active_now.version == 3

        v1_reloaded = repo.get_by_id(v1.id)
        assert v1_reloaded is not None
        assert v1_reloaded.is_active is False

    def test_cascade_delete_with_document(
        self, db_session: Session, sample_document: Document
    ) -> None:
        repo = StudyResourceRepository(db_session)
        r = repo.create(
            document_id=sample_document.id,
            resource_type=ResourceType.QUIZ,
            model_name="kilo-auto/free",
            status=ResourceStatus.COMPLETED,
        )
        db_session.commit()

        # Delete document
        db_session.delete(sample_document)
        db_session.commit()

        # Resource must be cascaded
        assert repo.get_by_id(r.id) is None

