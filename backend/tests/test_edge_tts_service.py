"""Unit and integration tests for Phase 9.1 Edge TTS Service and Speech Endpoints."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
from app.services.edge_tts_service import (
    DEFAULT_VOICE,
    SUPPORTED_VOICES,
    EdgeTTSService,
    TTSServiceError,
    TTSValidationError,
    clean_text_for_speech,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tts_user(db_session: Session) -> User:
    user = User(clerk_user_id="user_tts_test", email="tts@notemint.ai")
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def tts_document(db_session: Session, tts_user: User) -> Document:
    doc = Document(
        clerk_user_id=tts_user.clerk_user_id,
        original_filename="Photosynthesis.pdf",
        storage_key="test_photo_tts.pdf",
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
    db_session.commit()
    return doc


@pytest.fixture
def tts_client(db_session: Session, tts_user: User):
    def override_get_db():
        yield db_session

    def override_get_current_user():
        return AuthenticatedUser(
            user_id=tts_user.clerk_user_id,
            email=tts_user.email,
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 1. Text Normalization Unit Tests
# ---------------------------------------------------------------------------


def test_clean_text_for_speech_citations():
    """Verify that page citations are cleanly removed from speech text."""
    raw = "Photosynthesis occurs in the chloroplast [Page 4]. It produces glucose [Pages 5, 6]."
    cleaned = clean_text_for_speech(raw)
    assert "[Page 4]" not in cleaned
    assert "[Pages 5, 6]" not in cleaned
    assert "Photosynthesis occurs in the chloroplast." in cleaned
    assert "It produces glucose." in cleaned


def test_clean_text_for_speech_markdown_formatting():
    """Verify headings, bold, italics, code blocks, and bullet points are cleaned."""
    raw = """
# Chapter 1: Introduction
Here is **bold text** and *italic text*.
Also `inline code` and a block:
```python
x = 10
```
- First point
- Second point
---
> A famous quote
"""
    cleaned = clean_text_for_speech(raw)
    assert "#" not in cleaned
    assert "**" not in cleaned
    assert "*" not in cleaned
    assert "```" not in cleaned
    assert "`" not in cleaned
    assert "---" not in cleaned
    assert ">" not in cleaned
    assert "Chapter 1: Introduction" in cleaned
    assert "bold text and italic text" in cleaned
    assert "First point" in cleaned
    assert "Second point" in cleaned


def test_clean_text_for_speech_tables():
    """Verify markdown tables are transformed into spoken sentences."""
    raw = """
| Term | Definition |
| --- | --- |
| Chlorophyll | Green pigment |
| Stoma | Microscopic pore |
"""
    cleaned = clean_text_for_speech(raw)
    assert "|" not in cleaned
    assert "Term: Chlorophyll. Definition: Green pigment." in cleaned
    assert "Term: Stoma. Definition: Microscopic pore." in cleaned


def test_clean_text_for_speech_empty():
    """Verify empty or whitespace strings return empty string."""
    assert clean_text_for_speech("") == ""
    assert clean_text_for_speech("   \n\t  ") == ""


# ---------------------------------------------------------------------------
# 2. EdgeTTSService Unit Tests (Using asyncio.run)
# ---------------------------------------------------------------------------


def test_edge_tts_voice_validation():
    """Verify that unsupported voices raise TTSValidationError."""
    service = EdgeTTSService()
    with pytest.raises(TTSValidationError, match="Unsupported voice 'alien-voice'"):
        asyncio.run(service.synthesize("Hello world", voice="alien-voice"))


def test_edge_tts_rate_validation():
    """Verify that invalid speech rate formats raise TTSValidationError."""
    service = EdgeTTSService()
    with pytest.raises(TTSValidationError, match="Invalid speech rate 'fast'"):
        asyncio.run(service.synthesize("Hello world", rate="fast"))


def test_edge_tts_empty_text_validation():
    """Verify that empty or citation-only text raises TTSValidationError."""
    service = EdgeTTSService()
    with pytest.raises(TTSValidationError, match="Text cannot be empty"):
        asyncio.run(service.synthesize("   [Page 1]   "))


def test_edge_tts_synthesize_success():
    """Verify successful synthesis produces MP3 audio bytes using mocked Communicate stream."""
    service = EdgeTTSService()
    fake_chunk = {"type": "audio", "data": b"\xff\xfb\x90\x64\x00\x00fake_mp3_data"}

    class MockCommunicate:
        async def stream(self):
            yield fake_chunk

    with patch("edge_tts.Communicate", return_value=MockCommunicate()):
        audio = asyncio.run(
            service.synthesize(
                text="Hello students, today we study physics.",
                voice="en-IN-NeerjaNeural",
                rate="+0%",
            )
        )
        assert audio == fake_chunk["data"]


def test_edge_tts_synthesize_failure():
    """Verify service errors are caught and re-raised as TTSServiceError."""
    service = EdgeTTSService()

    class FailingCommunicate:
        async def stream(self):
            raise RuntimeError("Network disconnect")
            yield  # pragma: no cover

    with patch("edge_tts.Communicate", return_value=FailingCommunicate()):
        with pytest.raises(TTSServiceError, match="Failed to synthesize speech"):
            asyncio.run(service.synthesize("Test text"))


# ---------------------------------------------------------------------------
# 3. Speech API Endpoint Tests
# ---------------------------------------------------------------------------


def test_synthesize_speech_endpoint_success(
    tts_client: TestClient,
    db_session: Session,
    tts_document: Document,
):
    """Verify POST speech returns audio/mpeg for completed assistant message."""
    conv = TeacherConversation(
        document_id=tts_document.id,
        clerk_user_id=tts_document.clerk_user_id,
        title="Voice Study Test",
        teaching_mode="explain",
        explanation_depth="standard",
        preferred_language="auto",
    )
    db_session.add(conv)
    db_session.flush()

    msg = TeacherMessage(
        conversation_id=conv.id,
        role="assistant",
        content="Photosynthesis is the process by which green plants make food [Page 1].",
        status="completed",
        source_pages=[1],
    )
    db_session.add(msg)
    db_session.commit()

    fake_mp3 = b"\xff\xf3\x44\x00test_audio_stream"
    with patch.object(EdgeTTSService, "synthesize", new_callable=AsyncMock) as mock_synth:
        mock_synth.return_value = fake_mp3

        resp = tts_client.post(
            f"/api/v1/documents/{tts_document.id}/conversations/{conv.id}/messages/{msg.id}/speech",
            json={"voice": "en-IN-NeerjaNeural", "rate": "+0%"},
        )

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/mpeg"
        assert resp.content == fake_mp3
        mock_synth.assert_awaited_once()


def test_synthesize_speech_rejects_user_message(
    tts_client: TestClient,
    db_session: Session,
    tts_document: Document,
):
    """Verify POST speech rejects user messages with 400 Bad Request."""
    conv = TeacherConversation(
        document_id=tts_document.id,
        clerk_user_id=tts_document.clerk_user_id,
        title="User Message Test",
    )
    db_session.add(conv)
    db_session.flush()

    msg = TeacherMessage(
        conversation_id=conv.id,
        role="user",
        content="What is photosynthesis?",
        status="completed",
    )
    db_session.add(msg)
    db_session.commit()

    resp = tts_client.post(
        f"/api/v1/documents/{tts_document.id}/conversations/{conv.id}/messages/{msg.id}/speech",
        json={"voice": "en-IN-NeerjaNeural"},
    )
    assert resp.status_code == 400
    assert "only available for AI Teacher assistant messages" in resp.json()["detail"]


def test_synthesize_speech_rejects_uncompleted_message(
    tts_client: TestClient,
    db_session: Session,
    tts_document: Document,
):
    """Verify POST speech rejects processing or failed messages."""
    conv = TeacherConversation(
        document_id=tts_document.id,
        clerk_user_id=tts_document.clerk_user_id,
        title="Processing Test",
    )
    db_session.add(conv)
    db_session.flush()

    msg = TeacherMessage(
        conversation_id=conv.id,
        role="assistant",
        content="",
        status="processing",
    )
    db_session.add(msg)
    db_session.commit()

    resp = tts_client.post(
        f"/api/v1/documents/{tts_document.id}/conversations/{conv.id}/messages/{msg.id}/speech",
    )
    assert resp.status_code == 400
    assert "Message must be completed" in resp.json()["detail"]


def test_synthesize_speech_message_not_found(
    tts_client: TestClient,
    db_session: Session,
    tts_document: Document,
):
    """Verify POST speech returns 404 for missing message."""
    conv = TeacherConversation(
        document_id=tts_document.id,
        clerk_user_id=tts_document.clerk_user_id,
        title="Missing Message Test",
    )
    db_session.add(conv)
    db_session.commit()

    fake_msg_id = uuid.uuid4()
    resp = tts_client.post(
        f"/api/v1/documents/{tts_document.id}/conversations/{conv.id}/messages/{fake_msg_id}/speech",
    )
    assert resp.status_code == 404


def test_list_supported_voices_endpoint(
    tts_client: TestClient,
    tts_document: Document,
):
    """Verify GET /voices returns supported Edge TTS voices."""
    resp = tts_client.get(
        f"/api/v1/documents/{tts_document.id}/conversations/voices",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["default_voice"] == DEFAULT_VOICE
    assert "en-IN-NeerjaNeural" in data["voices"]
    assert "hi-IN-SwaraNeural" in data["voices"]


def test_synthesize_streaming_speech_chunk_endpoint(
    tts_client: TestClient,
    db_session: Session,
    tts_document: Document,
):
    """Verify POST .../speech synthesizes speech for a real-time text snippet."""
    conv = TeacherConversation(
        document_id=tts_document.id,
        clerk_user_id=tts_document.clerk_user_id,
        title="Streaming Chunk Test",
    )
    db_session.add(conv)
    db_session.commit()

    fake_mp3 = b"\xff\xf3\x44\x00streaming_chunk"
    with patch.object(EdgeTTSService, "synthesize", new_callable=AsyncMock) as mock_synth:
        mock_synth.return_value = fake_mp3

        resp = tts_client.post(
            f"/api/v1/documents/{tts_document.id}/conversations/{conv.id}/speech",
            json={
                "text": "Photosynthesis is the process by which green plants make food.",
                "voice": "en-IN-NeerjaNeural",
                "rate": "+0%",
            },
        )

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/mpeg"
        assert resp.content == fake_mp3
        mock_synth.assert_awaited_once()


def test_synthesize_streaming_speech_empty_text_rejected(
    tts_client: TestClient,
    db_session: Session,
    tts_document: Document,
):
    """Verify POST .../speech rejects empty text snippet with 400."""
    conv = TeacherConversation(
        document_id=tts_document.id,
        clerk_user_id=tts_document.clerk_user_id,
        title="Empty Chunk Test",
    )
    db_session.add(conv)
    db_session.commit()

    resp = tts_client.post(
        f"/api/v1/documents/{tts_document.id}/conversations/{conv.id}/speech",
        json={"text": "   "},
    )
    assert resp.status_code == 400
    assert "Text snippet is required" in resp.json()["detail"]

