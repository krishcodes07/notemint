"""Tests for Phase 9 TeacherConversation and TeacherMessage models and repository."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.teacher_conversation import TeacherConversation
from app.models.teacher_message import TeacherMessage
from app.models.user import User
from app.repositories.teacher_repository import TeacherRepository


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_teacher_test", email="test@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def other_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_other_test", email="other@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_doc(db_session: Session, test_user: User) -> Document:
    doc = Document(
        clerk_user_id=test_user.clerk_user_id,
        original_filename="Biology_Ch4.pdf",
        storage_key="test_biology_ch4.pdf",
        mime_type="application/pdf",
        file_size_bytes=10240,
        status=DocumentStatus.COMPLETED,
        page_count=10,
    )
    db_session.add(doc)
    db_session.commit()
    return doc


class TestTeacherRepository:
    def test_create_and_get_conversation(
        self, db_session: Session, test_doc: Document, test_user: User
    ) -> None:
        repo = TeacherRepository(db_session)
        conv = repo.create_conversation(
            document_id=test_doc.id,
            clerk_user_id=test_user.clerk_user_id,
            title="Cell Division Doubt",
            teaching_mode="socratic",
            explanation_depth="detailed",
            preferred_language="hinglish",
        )
        assert conv.id is not None
        assert conv.title == "Cell Division Doubt"
        assert conv.teaching_mode == "socratic"
        assert conv.explanation_depth == "detailed"
        assert conv.preferred_language == "hinglish"

        # Fetch by ID
        fetched = repo.get_conversation(conv.id, clerk_user_id=test_user.clerk_user_id)
        assert fetched is not None
        assert fetched.id == conv.id

        # User isolation
        other_fetched = repo.get_conversation(conv.id, clerk_user_id="stranger")
        assert other_fetched is None

    def test_list_conversations_pagination(
        self, db_session: Session, test_doc: Document, test_user: User
    ) -> None:
        repo = TeacherRepository(db_session)
        c1 = repo.create_conversation(test_doc.id, test_user.clerk_user_id, title="Conv 1")
        c2 = repo.create_conversation(test_doc.id, test_user.clerk_user_id, title="Conv 2")
        c3 = repo.create_conversation(test_doc.id, test_user.clerk_user_id, title="Conv 3")

        items, total = repo.list_conversations(test_doc.id, test_user.clerk_user_id, limit=2, offset=0)
        assert total == 3
        assert len(items) == 2

        items_p2, total2 = repo.list_conversations(test_doc.id, test_user.clerk_user_id, limit=2, offset=2)
        assert len(items_p2) == 1

    def test_update_conversation(
        self, db_session: Session, test_doc: Document, test_user: User
    ) -> None:
        repo = TeacherRepository(db_session)
        conv = repo.create_conversation(test_doc.id, test_user.clerk_user_id)
        updated = repo.update_conversation(
            conv,
            title="Updated Title",
            teaching_mode="simplify",
            explanation_depth="quick",
            preferred_language="hi",
        )
        assert updated.title == "Updated Title"
        assert updated.teaching_mode == "simplify"
        assert updated.explanation_depth == "quick"
        assert updated.preferred_language == "hi"

    def test_create_messages_and_order(
        self, db_session: Session, test_doc: Document, test_user: User
    ) -> None:
        repo = TeacherRepository(db_session)
        conv = repo.create_conversation(test_doc.id, test_user.clerk_user_id)

        m1 = repo.create_message(
            conversation_id=conv.id,
            role="user",
            content="What is mitosis?",
            client_message_id="client_msg_1",
        )
        m2 = repo.create_message(
            conversation_id=conv.id,
            role="assistant",
            content="Mitosis is a process of cell duplication. [Page 4]",
            source_pages=[4],
            model_name="kilo-auto/free",
            input_tokens=150,
            output_tokens=60,
            status="completed",
        )

        messages = repo.list_messages(conv.id)
        assert len(messages) == 2
        assert messages[0].role == "user"
        assert messages[0].client_message_id == "client_msg_1"
        assert messages[1].role == "assistant"
        assert messages[1].source_pages == [4]

        # Test lookup by client_message_id
        found_by_client_id = repo.get_message_by_client_id(conv.id, "client_msg_1")
        assert found_by_client_id is not None
        assert found_by_client_id.id == m1.id

    def test_cascade_delete_conversation(
        self, db_session: Session, test_doc: Document, test_user: User
    ) -> None:
        repo = TeacherRepository(db_session)
        conv = repo.create_conversation(test_doc.id, test_user.clerk_user_id)
        msg = repo.create_message(conv.id, role="user", content="Hello!")
        msg_id = msg.id

        # Delete conversation
        repo.delete_conversation(conv)

        # Message must be cascaded
        assert repo.get_message(msg_id) is None
        assert repo.get_conversation(conv.id) is None

    def test_cascade_delete_document(
        self, db_session: Session, test_doc: Document, test_user: User
    ) -> None:
        repo = TeacherRepository(db_session)
        conv = repo.create_conversation(test_doc.id, test_user.clerk_user_id)
        msg = repo.create_message(conv.id, role="user", content="Test doc cascade")
        conv_id = conv.id
        msg_id = msg.id

        # Delete document
        db_session.delete(test_doc)
        db_session.commit()

        # Conversation and message must be deleted
        assert repo.get_conversation(conv_id) is None
        assert repo.get_message(msg_id) is None

