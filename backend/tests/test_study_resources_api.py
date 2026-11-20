"""API integration tests for Phase 7 AI Study Resources endpoints."""

from __future__ import annotations

import uuid
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
from tests.conftest import auth_header, make_token


@pytest.fixture
def test_user_id() -> str:
    return "user_api_tester_123"


@pytest.fixture
def other_user_id() -> str:
    return "user_api_tester_999"


@pytest.fixture
def sample_extracted_doc(db_session: Session, test_user_id: str) -> Document:
    # Ensure user exists
    user = User(clerk_user_id=test_user_id)
    db_session.add(user)
    db_session.flush()

    doc = Document(
        id=uuid.uuid4(),
        clerk_user_id=test_user_id,
        original_filename="biology-notes.pdf",
        storage_key=f"users/{test_user_id}/docs/bio.pdf",
        mime_type="application/pdf",
        file_size_bytes=4096,
        status=DocumentStatus.COMPLETED,
    )
    db_session.add(doc)

    ext = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=1500,
    )
    db_session.add(ext)

    for p in range(1, 4):
        page = DocumentPage(
            document_id=doc.id,
            page_number=p,
            text=f"Page {p} content on cell structures, chloroplasts, and energy metabolism.",
            character_count=80,
            has_text=True,
        )
        db_session.add(page)

    db_session.commit()
    return doc


class TestGenerateStudyResourcesAPI:
    def test_unauthenticated_request_rejected(
        self, client: TestClient, sample_extracted_doc: Document
    ) -> None:
        resp = client.post(
            f"/api/v1/documents/{sample_extracted_doc.id}/generate",
            json={"resource_types": ["notes"]},
        )
        assert resp.status_code == 401

    def test_generate_requires_completed_extraction(
        self,
        client: TestClient,
        db_session: Session,
        test_user_id: str,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        user = User(clerk_user_id=test_user_id)
        db_session.merge(user)
        db_session.flush()

        doc = Document(
            id=uuid.uuid4(),
            clerk_user_id=test_user_id,
            original_filename="incomplete.pdf",
            storage_key="k_inc",
            mime_type="application/pdf",
            file_size_bytes=1000,
            status=DocumentStatus.EXTRACTING,
        )
        db_session.add(doc)
        ext = DocumentExtraction(
            document_id=doc.id,
            status=ExtractionStatus.EXTRACTING,
        )
        db_session.add(ext)
        db_session.commit()

        private_key, _ = rsa_keys
        token = make_token(private_key, sub=test_user_id)
        resp = client.post(
            f"/api/v1/documents/{doc.id}/generate",
            json={"resource_types": ["notes"]},
            headers=auth_header(token),
        )
        assert resp.status_code == 400
        assert "extraction must be completed" in resp.json()["detail"].lower()

    @patch("app.api.v1.study_resources.enqueue_ai_generation_task")
    def test_generate_initiates_jobs_successfully(
        self,
        mock_enqueue: MagicMock,
        client: TestClient,
        sample_extracted_doc: Document,
        test_user_id: str,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        mock_enqueue.return_value = True
        private_key, _ = rsa_keys
        token = make_token(private_key, sub=test_user_id)

        resp = client.post(
            f"/api/v1/documents/{sample_extracted_doc.id}/generate",
            json={"resource_types": ["notes", "flashcards", "quiz"]},
            headers=auth_header(token),
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["enqueued_count"] == 3
        assert len(data["jobs"]) == 3
        assert mock_enqueue.call_count == 3


class TestStudyResourcesRetrievalAndSanitizationAPI:
    def test_list_resources_user_isolation(
        self,
        client: TestClient,
        sample_extracted_doc: Document,
        other_user_id: str,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub=other_user_id)
        resp = client.get(
            f"/api/v1/documents/{sample_extracted_doc.id}/resources",
            headers=auth_header(token),
        )
        assert resp.status_code == 404

    def test_quiz_answer_keys_are_sanitized_for_client(
        self,
        client: TestClient,
        db_session: Session,
        sample_extracted_doc: Document,
        test_user_id: str,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        repo = StudyResourceRepository(db_session)
        quiz_data = {
            "title": "Cell Biology Quiz",
            "questions": [
                {
                    "id": "mcq_secret_1",
                    "question": "Which organelle generates ATP?",
                    "options": ["Ribosome", "Mitochondria", "Vacuole", "Nucleus"],
                    "correct_option_index": 1,
                    "explanation": "Mitochondria are the powerhouses of the cell.",
                    "difficulty": "easy",
                    "source_pages": [2],
                }
            ],
        }
        res = repo.create(
            document_id=sample_extracted_doc.id,
            resource_type=ResourceType.QUIZ,
            model_name="kilo-auto/free",
            content=quiz_data,
            status=ResourceStatus.COMPLETED,
            is_active=True,
        )
        db_session.commit()

        private_key, _ = rsa_keys
        token = make_token(private_key, sub=test_user_id)

        # 1. Test in list endpoint
        resp = client.get(
            f"/api/v1/documents/{sample_extracted_doc.id}/resources",
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        q_item = items[0]["content"]["questions"][0]
        # Crucial security check: answers and explanations must NOT be present
        assert "correct_option_index" not in q_item
        assert "explanation" not in q_item
        assert q_item["options"] == ["Ribosome", "Mitochondria", "Vacuole", "Nucleus"]

        # 2. Test in single resource endpoint
        resp_single = client.get(
            f"/api/v1/documents/{sample_extracted_doc.id}/resources/{res.id}",
            headers=auth_header(token),
        )
        assert resp_single.status_code == 200
        single_q = resp_single.json()["content"]["questions"][0]
        assert "correct_option_index" not in single_q
        assert "explanation" not in single_q


class TestQuizSubmissionAndGradingAPI:
    def test_submit_quiz_evaluates_server_side_and_reveals_answers(
        self,
        client: TestClient,
        db_session: Session,
        sample_extracted_doc: Document,
        test_user_id: str,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        repo = StudyResourceRepository(db_session)
        quiz_data = {
            "title": "Cell Biology Quiz",
            "questions": [
                {
                    "id": "q_atp",
                    "question": "Which organelle generates ATP?",
                    "options": ["Ribosome", "Mitochondria", "Vacuole", "Nucleus"],
                    "correct_option_index": 1,
                    "explanation": "Mitochondria produce ATP through cellular respiration.",
                    "difficulty": "easy",
                    "source_pages": [2],
                },
                {
                    "id": "q_dna",
                    "question": "Where is chromosomal DNA stored in eukaryotes?",
                    "options": ["Nucleus", "Cytoplasm", "Endoplasmic Reticulum", "Lysosome"],
                    "correct_option_index": 0,
                    "explanation": "Chromosomal DNA is enclosed in the double-membrane nucleus.",
                    "difficulty": "easy",
                    "source_pages": [1],
                },
            ],
        }
        res = repo.create(
            document_id=sample_extracted_doc.id,
            resource_type=ResourceType.QUIZ,
            model_name="kilo-auto/free",
            content=quiz_data,
            status=ResourceStatus.COMPLETED,
            is_active=True,
        )
        db_session.commit()

        private_key, _ = rsa_keys
        token = make_token(private_key, sub=test_user_id)

        # Student submits: correct answer for q_atp (1), incorrect answer for q_dna (2 instead of 0)
        submission = {
            "answers": {
                "q_atp": 1,
                "q_dna": 2,
            }
        }

        resp = client.post(
            f"/api/v1/documents/{sample_extracted_doc.id}/quiz/{res.id}/submit",
            json=submission,
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        result = resp.json()

        assert result["total_questions"] == 2
        assert result["answered_questions"] == 2
        assert result["correct_answers"] == 1
        assert result["score_percentage"] == 50.0

        q1_res = next(r for r in result["results"] if r["question_id"] == "q_atp")
        assert q1_res["is_correct"] is True
        assert q1_res["selected_option_index"] == 1
        assert q1_res["correct_option_index"] == 1
        assert "produce ATP" in q1_res["explanation"]

        q2_res = next(r for r in result["results"] if r["question_id"] == "q_dna")
        assert q2_res["is_correct"] is False
        assert q2_res["selected_option_index"] == 2
        assert q2_res["correct_option_index"] == 0
        assert "double-membrane nucleus" in q2_res["explanation"]


class TestGenerationStatusAPI:
    def test_get_generation_status(
        self,
        client: TestClient,
        db_session: Session,
        sample_extracted_doc: Document,
        test_user_id: str,
        mock_jwks: Any,
        rsa_keys: tuple[Any, Any],
    ) -> None:
        repo = StudyResourceRepository(db_session)
        repo.create(
            document_id=sample_extracted_doc.id,
            resource_type=ResourceType.NOTES,
            model_name="kilo-auto/free",
            status=ResourceStatus.COMPLETED,
            is_active=True,
            version=1,
        )
        repo.create(
            document_id=sample_extracted_doc.id,
            resource_type=ResourceType.FLASHCARDS,
            model_name="kilo-auto/free",
            status=ResourceStatus.GENERATING,
            is_active=False,
            version=1,
        )
        db_session.commit()

        private_key, _ = rsa_keys
        token = make_token(private_key, sub=test_user_id)
        resp = client.get(
            f"/api/v1/documents/{sample_extracted_doc.id}/generation-status",
            headers=auth_header(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["document_id"] == str(sample_extracted_doc.id)
        assert data["resources"]["notes"]["status"] == "completed"
        assert data["resources"]["flashcards"]["status"] == "generating"
        assert data["resources"]["quiz"]["status"] == "not_started"
