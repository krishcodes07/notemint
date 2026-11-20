"""Integration and API tests for Phase 9 AI Teacher endpoints and service."""

from __future__ import annotations

import json
import uuid
from typing import Any, Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.base import (
    AICompletionResult,
    AIProviderError,
    BaseAIProvider,
)
from app.ai.prompts.teacher import (
    build_teacher_system_prompt,
    extract_cited_pages,
    sanitize_and_verify_citations,
)
from app.ai.provider_factory import get_ai_provider
from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.main import app
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.models.teacher_conversation import TeacherConversation
from app.models.teacher_message import TeacherMessage
from app.models.user import User
from app.schemas.auth import AuthenticatedUser
from app.services.teacher_chat_service import TeacherChatService


class MockAIProvider(BaseAIProvider):
    """Deterministic mock provider for AI Teacher test suite."""

    def __init__(self, response_text: str = "Photosynthesis requires sunlight. [Page 4]") -> None:
        self.response_text = response_text
        self.generate_called = 0
        self.stream_called = 0

    def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> AICompletionResult:
        self.generate_called += 1
        return AICompletionResult(
            content=self.response_text,
            model="mock-teacher-model",
            input_tokens=120,
            output_tokens=45,
            total_tokens=165,
        )

    def generate_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> Iterator[str]:
        self.stream_called += 1
        words = self.response_text.split(" ")
        for w in words:
            yield w + " "


@pytest.fixture
def test_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_api_teacher", email="teacher@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def other_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_other_api", email="other@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def test_doc(db_session: Session, test_user: User) -> Document:
    doc = Document(
        clerk_user_id=test_user.clerk_user_id,
        original_filename="Photosynthesis.pdf",
        storage_key="test_photo.pdf",
        mime_type="application/pdf",
        file_size_bytes=10240,
        status=DocumentStatus.COMPLETED,
        page_count=5,
    )
    db_session.add(doc)
    db_session.flush()

    ext = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=800,
    )
    db_session.add(ext)
    db_session.flush()

    pages = [
        DocumentPage(
            document_id=doc.id,
            page_number=1,
            text="Chapter 1: Plant Anatomy and Cell Structure.",
            character_count=45,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=4,
            text="Photosynthesis: Chlorophyll absorbs sunlight to synthesize glucose from CO2 and water.",
            character_count=90,
            has_text=True,
        ),
    ]
    db_session.add_all(pages)
    db_session.commit()
    return doc


@pytest.fixture
def mock_provider() -> MockAIProvider:
    return MockAIProvider()


@pytest.fixture
def client(db_session: Session, test_user: User, mock_provider: MockAIProvider) -> TestClient:
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        user_id=test_user.clerk_user_id,
    )
    app.dependency_overrides[get_ai_provider] = lambda: mock_provider
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestPromptAndCitationLogic:
    def test_prompt_generation_modes_and_languages(self) -> None:
        explain_en = build_teacher_system_prompt("explain", "standard", "en")
        assert "TEACHING MODE: EXPLAIN" in explain_en
        assert "LANGUAGE PREFERENCE: ENGLISH" in explain_en

        simplify_hinglish = build_teacher_system_prompt("simplify", "quick", "hinglish")
        assert "TEACHING MODE: SIMPLIFY" in simplify_hinglish
        assert "EXPLANATION DEPTH: QUICK" in simplify_hinglish
        assert "LANGUAGE PREFERENCE: HINGLISH" in simplify_hinglish

        socratic_hi = build_teacher_system_prompt("socratic", "detailed", "hi")
        assert "TEACHING MODE: SOCRATIC" in socratic_hi
        assert "EXPLANATION DEPTH: DETAILED" in socratic_hi
        assert "LANGUAGE PREFERENCE: HINDI" in socratic_hi

    def test_citation_extraction_and_verification(self) -> None:
        text = "Plants use sunlight [Page 4] and thylakoid membranes [Page 4, Page 5]. See also Page 12."
        cited = extract_cited_pages(text)
        assert 4 in cited
        assert 5 in cited
        assert 12 in cited

        # Only pages 4 and 5 were actually provided in context
        allowed = [1, 2, 4, 5]
        verified = sanitize_and_verify_citations(cited, allowed)
        assert verified == [4, 5]
        assert 12 not in verified  # 12 is hallucinated and filtered out


class TestTeacherChatEndpoints:
    def test_create_and_get_conversation(
        self, client: TestClient, test_doc: Document
    ) -> None:
        resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={
                "title": "Photosynthesis Basics",
                "teaching_mode": "explain",
                "explanation_depth": "standard",
                "preferred_language": "auto",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Photosynthesis Basics"
        assert data["teaching_mode"] == "explain"
        conv_id = data["id"]

        # Get conversation detail
        get_resp = client.get(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}")
        assert get_resp.status_code == 200
        detail = get_resp.json()
        assert detail["id"] == conv_id
        assert detail["messages"] == []

    def test_list_and_update_conversations(
        self, client: TestClient, test_doc: Document
    ) -> None:
        # Create conversation
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "Original Title"},
        )
        conv_id = create_resp.json()["id"]

        # List
        list_resp = client.get(f"/api/v1/documents/{test_doc.id}/conversations")
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] >= 1

        # Update
        patch_resp = client.patch(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}",
            json={"title": "Updated Title", "teaching_mode": "socratic"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["title"] == "Updated Title"
        assert patch_resp.json()["teaching_mode"] == "socratic"

    def test_delete_conversation(
        self, client: TestClient, test_doc: Document
    ) -> None:
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "To Delete"},
        )
        conv_id = create_resp.json()["id"]

        del_resp = client.delete(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}")
        assert del_resp.status_code == 204

        # Confirm 404
        get_resp = client.get(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}")
        assert get_resp.status_code == 404

    def test_send_message_sync(
        self, client: TestClient, test_doc: Document
    ) -> None:
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "Chat Test"},
        )
        conv_id = create_resp.json()["id"]

        # Send user message
        msg_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}/messages",
            json={"content": "What is photosynthesis?", "client_message_id": "test_c1"},
        )
        assert msg_resp.status_code == 200
        data = msg_resp.json()
        assert data["role"] == "assistant"
        assert data["status"] == "completed"
        assert data["source_pages"] == [4]
        assert "Photosynthesis requires sunlight" in data["content"]

        # Check conversation detail has both user and assistant messages
        conv_detail = client.get(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}").json()
        assert len(conv_detail["messages"]) == 2
        assert conv_detail["messages"][0]["role"] == "user"
        assert conv_detail["messages"][0]["client_message_id"] == "test_c1"
        assert conv_detail["messages"][1]["role"] == "assistant"

    def test_send_message_idempotency(
        self, client: TestClient, test_doc: Document
    ) -> None:
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "Idempotent Chat"},
        )
        conv_id = create_resp.json()["id"]

        # First send
        r1 = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}/messages",
            json={"content": "What is chlorophyll?", "client_message_id": "idempotent_key_99"},
        )
        assert r1.status_code == 200

        # Resend with same key
        r2 = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}/messages",
            json={"content": "What is chlorophyll?", "client_message_id": "idempotent_key_99"},
        )
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]

        # Confirm no duplicate user messages were added
        conv_detail = client.get(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}").json()
        assert len(conv_detail["messages"]) == 2

    def test_send_message_streaming_sse(
        self, client: TestClient, test_doc: Document
    ) -> None:
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "Streaming Chat"},
        )
        conv_id = create_resp.json()["id"]

        stream_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}/messages/stream",
            json={"content": "How do plants convert sunlight?"},
        )
        assert stream_resp.status_code == 200
        assert "text/event-stream" in stream_resp.headers["content-type"]

        body = stream_resp.text
        assert "event: message_started" in body
        assert "event: text_delta" in body
        assert "event: message_completed" in body

        # Verify assistant message was saved in DB
        conv_detail = client.get(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}").json()
        assert len(conv_detail["messages"]) == 2
        assert conv_detail["messages"][1]["status"] == "completed"

    def test_retry_failed_message(
        self, client: TestClient, test_doc: Document, db_session: Session
    ) -> None:
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "Retry Chat"},
        )
        conv_id = uuid.UUID(create_resp.json()["id"])

        # Manually create user message and failed assistant message
        user_msg = TeacherMessage(
            conversation_id=conv_id,
            role="user",
            content="Explain photolysis",
            status="completed",
        )
        assistant_msg = TeacherMessage(
            conversation_id=conv_id,
            role="assistant",
            content="",
            status="failed",
            error_message="Gateway timeout",
        )
        db_session.add_all([user_msg, assistant_msg])
        db_session.commit()

        # Retry the failed assistant message
        retry_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}/messages/{assistant_msg.id}/retry"
        )
        assert retry_resp.status_code == 200
        data = retry_resp.json()
        assert data["id"] == str(assistant_msg.id)
        assert data["status"] == "completed"
        assert "Photosynthesis requires sunlight" in data["content"]

    def test_user_ownership_isolation(
        self, client: TestClient, test_doc: Document, other_user: User, db_session: Session
    ) -> None:
        # Create conversation as test_user
        create_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations",
            json={"title": "Private Chat"},
        )
        conv_id = create_resp.json()["id"]

        # Override user to other_user
        app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
            user_id=other_user.clerk_user_id,
        )

        # other_user should get 404 for test_user's document conversation
        get_resp = client.get(f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}")
        assert get_resp.status_code == 404

        post_resp = client.post(
            f"/api/v1/documents/{test_doc.id}/conversations/{conv_id}/messages",
            json={"content": "Can I spy?"},
        )
        assert post_resp.status_code == 404
