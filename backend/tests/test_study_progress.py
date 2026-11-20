"""Tests for Phase 8 study workspace progress, flashcards, bookmarks, quiz attempts, and search."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentStatus
from app.models.study_progress import (
    ActivityType,
    FlashcardProgress,
    QuestionBookmark,
    QuizAttempt,
    StudyActivity,
)
from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)
from app.models.user import User
from app.repositories.study_progress_repository import StudyProgressRepository
from app.repositories.study_resource_repository import StudyResourceRepository
from tests.conftest import auth_header, make_token


@pytest.fixture
def test_user_id() -> str:
    return "user_phase8_tester_123"


@pytest.fixture
def other_user_id() -> str:
    return "user_phase8_other_456"


@pytest.fixture
def auth_headers(rsa_keys: tuple[Any, Any], test_user_id: str, mock_jwks: Any) -> dict[str, str]:
    private_key, _ = rsa_keys
    token = make_token(private_key, sub=test_user_id)
    return auth_header(token)


@pytest.fixture
def other_auth_headers(rsa_keys: tuple[Any, Any], other_user_id: str, mock_jwks: Any) -> dict[str, str]:
    private_key, _ = rsa_keys
    token = make_token(private_key, sub=other_user_id)
    return auth_header(token)


@pytest.fixture
def sample_study_environment(db_session: Session, test_user_id: str) -> dict[str, Any]:
    """Create test user, document, and 5 active generated study resources."""
    user = User(clerk_user_id=test_user_id)
    db_session.add(user)
    db_session.flush()

    doc = Document(
        id=uuid.uuid4(),
        clerk_user_id=test_user_id,
        original_filename="photosynthesis-grade10.pdf",
        storage_key=f"users/{test_user_id}/docs/photo.pdf",
        mime_type="application/pdf",
        file_size_bytes=8192,
        status=DocumentStatus.COMPLETED,
    )
    db_session.add(doc)
    db_session.flush()

    # 1. Notes resource
    notes_content = {
        "title": "Photosynthesis Fundamentals",
        "overview": "Comprehensive overview of light and dark reactions.",
        "sections": [
            {
                "heading": "Light-Dependent Reactions",
                "content": "Photolysis of water occurs in the thylakoid membrane generating ATP and NADPH.",
                "key_points": [
                    "Chlorophyll absorbs light energy at specific wavelengths.",
                    "Water molecules split releasing oxygen as a byproduct.",
                ],
                "source_pages": [1, 2],
            },
            {
                "heading": "Calvin Cycle",
                "content": "Carbon fixation takes place in the stroma using RuBisCO enzyme.",
                "key_points": [
                    "Carbon dioxide is fixed into glyceraldehyde-3-phosphate (G3P).",
                    "Requires energy from ATP and reducing power of NADPH.",
                ],
                "source_pages": [2, 3],
            },
        ],
        "key_terms": [
            {
                "term": "Chloroplast",
                "definition": "Double-membraned organelle containing thylakoids and stroma.",
                "source_pages": [1],
            },
            {
                "term": "RuBisCO",
                "definition": "Enzyme that catalyzes the primary carbon-fixing reaction.",
                "source_pages": [3],
            },
        ],
    }
    notes_res = StudyResource(
        id=uuid.uuid4(),
        document_id=doc.id,
        resource_type=ResourceType.NOTES,
        status=ResourceStatus.COMPLETED,
        content=notes_content,
        model_name="test-model",
        version=1,
        is_active=True,
    )
    db_session.add(notes_res)

    # 2. Questions resource
    questions_content = {
        "title": "Photosynthesis Important Questions",
        "questions": [
            {
                "id": "q1",
                "question": "What is the primary function of chlorophyll in photosynthesis?",
                "answer": "Chlorophyll absorbs photon energy and drives electrons into the electron transport chain.",
                "answer_type": "short",
                "difficulty": "easy",
                "source_pages": [1],
                "important_points": ["Pigment absorption", "Excitation of electrons"],
            },
            {
                "id": "q2",
                "question": "Explain the stages of the Calvin Cycle in detail.",
                "answer": "Carbon fixation, reduction phase, and regeneration of ribulose 1,5-bisphosphate.",
                "answer_type": "long",
                "difficulty": "hard",
                "source_pages": [2, 3],
                "important_points": ["RuBisCO action", "ATP consumption", "G3P production"],
            },
        ],
    }
    questions_res = StudyResource(
        id=uuid.uuid4(),
        document_id=doc.id,
        resource_type=ResourceType.QUESTIONS,
        status=ResourceStatus.COMPLETED,
        content=questions_content,
        model_name="test-model",
        version=1,
        is_active=True,
    )
    db_session.add(questions_res)

    # 3. Flashcards resource
    flashcards_content = {
        "title": "Photosynthesis Flashcards",
        "cards": [
            {
                "id": "fc1",
                "front": "Where does the light-dependent reaction occur?",
                "back": "Thylakoid membranes inside the chloroplast.",
                "difficulty": "easy",
                "source_pages": [1],
            },
            {
                "id": "fc2",
                "front": "What enzyme fixes CO2 in the dark reactions?",
                "back": "RuBisCO (Ribulose-1,5-bisphosphate carboxylase-oxygenase).",
                "difficulty": "medium",
                "source_pages": [2],
            },
            {
                "id": "fc3",
                "front": "What are the products of photolysis?",
                "back": "Oxygen (O2), protons (H+), and electrons (e-).",
                "difficulty": "medium",
                "source_pages": [1],
            },
        ],
    }
    flashcards_res = StudyResource(
        id=uuid.uuid4(),
        document_id=doc.id,
        resource_type=ResourceType.FLASHCARDS,
        status=ResourceStatus.COMPLETED,
        content=flashcards_content,
        model_name="test-model",
        version=1,
        is_active=True,
    )
    db_session.add(flashcards_res)

    # 4. Quiz resource
    quiz_content = {
        "title": "Photosynthesis Diagnostic Quiz",
        "questions": [
            {
                "id": "mcq1",
                "question": "Which molecule is split during photolysis?",
                "options": ["Glucose", "Water", "Carbon dioxide", "Oxygen"],
                "correct_option_index": 1,
                "explanation": "Water (H2O) is split in the thylakoid lumen by the oxygen-evolving complex.",
                "difficulty": "easy",
                "source_pages": [1],
            },
            {
                "id": "mcq2",
                "question": "Where does the Calvin cycle take place?",
                "options": ["Thylakoid lumen", "Outer membrane", "Stroma", "Granum"],
                "correct_option_index": 2,
                "explanation": "The Calvin cycle occurs in the stroma surrounding the thylakoids.",
                "difficulty": "medium",
                "source_pages": [2],
            },
        ],
    }
    quiz_res = StudyResource(
        id=uuid.uuid4(),
        document_id=doc.id,
        resource_type=ResourceType.QUIZ,
        status=ResourceStatus.COMPLETED,
        content=quiz_content,
        model_name="test-model",
        version=1,
        is_active=True,
    )
    db_session.add(quiz_res)

    # 5. Summary resource
    summary_content = {
        "title": "Chapter Summary: Photosynthesis",
        "overview": "Photosynthesis converts solar radiant energy into chemical energy stored in glucose bonds.",
        "main_topics": [
            {
                "topic": "Light Reactions",
                "summary": "Light energy is captured to produce ATP and NADPH.",
                "source_pages": [1],
            }
        ],
        "key_takeaways": ["Photosynthesis sustains terrestrial ecosystems."],
        "revision_summary": "In short: water and carbon dioxide yield glucose and oxygen using light.",
    }
    summary_res = StudyResource(
        id=uuid.uuid4(),
        document_id=doc.id,
        resource_type=ResourceType.SUMMARY,
        status=ResourceStatus.COMPLETED,
        content=summary_content,
        model_name="test-model",
        version=1,
        is_active=True,
    )
    db_session.add(summary_res)

    db_session.commit()

    return {
        "user": user,
        "document": doc,
        "notes": notes_res,
        "questions": questions_res,
        "flashcards": flashcards_res,
        "quiz": quiz_res,
        "summary": summary_res,
    }


# =============================================================================
# 1. Flashcard Mastery Tests
# =============================================================================


class TestFlashcardProgressAPI:
    def test_get_flashcard_progress_empty_initially(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        resp = client.get(f"/api/v1/documents/{doc_id}/flashcard-progress", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_cards"] == 3
        assert data["reviewed_cards"] == 0
        assert data["mastered_cards"] == 0
        assert data["learning_cards"] == 0
        assert len(data["items"]) == 0

    def test_update_flashcard_mastery_progression(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        fc_res_id = sample_study_environment["flashcards"].id

        # 1. First review: 'known' -> mastery level 1
        resp = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["card_id"] == "fc1"
        assert data["mastery_level"] == 1
        assert data["review_count"] == 1
        assert data["correct_count"] == 1
        assert data["incorrect_count"] == 0
        assert data["last_reviewed_at"] is not None

        # 2. Second review: 'known' -> mastery level 2
        resp2 = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        assert resp2.json()["mastery_level"] == 2
        assert resp2.json()["review_count"] == 2
        assert resp2.json()["correct_count"] == 2

        # 3. Third review: 'known' -> mastery level 3 (Mastered)
        resp3 = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        assert resp3.json()["mastery_level"] == 3
        assert resp3.json()["review_count"] == 3

        # 4. Fourth review: 'known' -> caps at 3
        resp4 = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        assert resp4.json()["mastery_level"] == 3
        assert resp4.json()["review_count"] == 4

        # 5. Review: 'again' -> steps down to 2
        resp5 = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
            json={"result": "again"},
            headers=auth_headers,
        )
        assert resp5.json()["mastery_level"] == 2
        assert resp5.json()["incorrect_count"] == 1
        assert resp5.json()["review_count"] == 5

    def test_flashcard_progress_learning_outcome(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        fc_res_id = sample_study_environment["flashcards"].id

        # 1. New card (level 0) -> 'learning' sets mastery level to 1
        resp = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc2/progress",
            json={"result": "learning"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["mastery_level"] == 1
        assert resp.json()["review_count"] == 1

        # 2. Advance to level 3 (known -> 2, known -> 3)
        client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc2/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        resp_known = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc2/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        assert resp_known.json()["mastery_level"] == 3

        # 3. Marking 'learning' on mastered card resets directly to level 1
        resp_learn = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc2/progress",
            json={"result": "learning"},
            headers=auth_headers,
        )
        assert resp_learn.json()["mastery_level"] == 1
        assert resp_learn.json()["review_count"] == 4

    def test_update_flashcard_invalid_card_id(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        fc_res_id = sample_study_environment["flashcards"].id

        resp = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/non_existent_card/progress",
            json={"result": "known"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "not found" in resp.json()["detail"].lower()

    def test_flashcard_progress_user_isolation(
        self,
        client: TestClient,
        sample_study_environment: dict[str, Any],
        auth_headers: dict[str, str],
        other_auth_headers: dict[str, str],
    ) -> None:
        doc_id = sample_study_environment["document"].id
        fc_res_id = sample_study_environment["flashcards"].id

        # Other user cannot access document progress
        resp = client.get(f"/api/v1/documents/{doc_id}/flashcard-progress", headers=other_auth_headers)
        assert resp.status_code == 404

        # Other user cannot update card progress
        resp2 = client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
            json={"result": "known"},
            headers=other_auth_headers,
        )
        assert resp2.status_code == 404

    def test_regeneration_progress_isolation(
        self,
        client: TestClient,
        db_session: Session,
        sample_study_environment: dict[str, Any],
        auth_headers: dict[str, str],
    ) -> None:
        doc_id = sample_study_environment["document"].id
        v1_res_id = sample_study_environment["flashcards"].id

        # Update progress on v1 card fc1
        client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{v1_res_id}/fc1/progress",
            json={"result": "known"},
            headers=auth_headers,
        )

        # Simulate regeneration: create v2 resource with different cards
        repo = StudyResourceRepository(db_session)
        v2_res = repo.create(
            document_id=doc_id,
            resource_type=ResourceType.FLASHCARDS,
            model_name="test-model",
            version=2,
            is_active=False,
        )
        v2_content = {
            "title": "Photosynthesis Flashcards v2",
            "cards": [
                {"id": "new_card_99", "front": "New front", "back": "New back", "difficulty": "easy", "source_pages": [1]},
            ],
        }
        repo.activate_successful_resource(v2_res.id, v2_content)
        db_session.commit()

        # Check that active progress (now v2) shows 0 reviewed cards and 1 total card
        resp = client.get(f"/api/v1/documents/{doc_id}/flashcard-progress", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["resource_id"] == str(v2_res.id)
        assert data["total_cards"] == 1
        assert data["reviewed_cards"] == 0

        # Historical v1 progress is still preserved when queried with explicit resource_id
        resp_v1 = client.get(
            f"/api/v1/documents/{doc_id}/flashcard-progress?resource_id={v1_res_id}",
            headers=auth_headers,
        )
        assert resp_v1.status_code == 200
        assert resp_v1.json()["reviewed_cards"] == 1


# =============================================================================
# 2. Question Bookmark Tests
# =============================================================================


class TestQuestionBookmarksAPI:
    def test_add_and_list_bookmarks(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        q_res_id = sample_study_environment["questions"].id

        # Initially empty
        resp = client.get(f"/api/v1/documents/{doc_id}/bookmarks", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

        # Add bookmark for q1
        create_resp = client.post(
            f"/api/v1/documents/{doc_id}/bookmarks",
            json={"resource_id": str(q_res_id), "question_id": "q1"},
            headers=auth_headers,
        )
        assert create_resp.status_code == 201
        bm_data = create_resp.json()
        assert bm_data["question_id"] == "q1"
        assert bm_data["resource_id"] == str(q_res_id)
        bookmark_id = bm_data["id"]

        # List reflects the new bookmark
        list_resp = client.get(f"/api/v1/documents/{doc_id}/bookmarks", headers=auth_headers)
        assert len(list_resp.json()) == 1
        assert list_resp.json()[0]["id"] == bookmark_id

        # Adding same bookmark again returns existing (idempotent, no duplicate error)
        dup_resp = client.post(
            f"/api/v1/documents/{doc_id}/bookmarks",
            json={"resource_id": str(q_res_id), "question_id": "q1"},
            headers=auth_headers,
        )
        assert dup_resp.status_code == 201
        assert dup_resp.json()["id"] == bookmark_id

        # Remove bookmark
        del_resp = client.delete(
            f"/api/v1/documents/{doc_id}/bookmarks/{bookmark_id}",
            headers=auth_headers,
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True

        # List is empty again
        assert client.get(f"/api/v1/documents/{doc_id}/bookmarks", headers=auth_headers).json() == []

    def test_add_bookmark_invalid_question_id(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        q_res_id = sample_study_environment["questions"].id

        resp = client.post(
            f"/api/v1/documents/{doc_id}/bookmarks",
            json={"resource_id": str(q_res_id), "question_id": "non_existent_q"},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "not found" in resp.json()["detail"].lower()

    def test_bookmark_user_isolation(
        self,
        client: TestClient,
        sample_study_environment: dict[str, Any],
        auth_headers: dict[str, str],
        other_auth_headers: dict[str, str],
    ) -> None:
        doc_id = sample_study_environment["document"].id
        q_res_id = sample_study_environment["questions"].id

        # Other user cannot add bookmark to this document
        resp = client.post(
            f"/api/v1/documents/{doc_id}/bookmarks",
            json={"resource_id": str(q_res_id), "question_id": "q1"},
            headers=other_auth_headers,
        )
        assert resp.status_code == 404


# =============================================================================
# 3. Quiz Attempts & History Tests
# =============================================================================


class TestQuizAttemptsAPI:
    def test_quiz_submission_persists_attempt_and_scores_accurately(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        quiz_res_id = sample_study_environment["quiz"].id

        # Submit answers: mcq1=1 (correct: Water), mcq2=0 (incorrect: should be 2 Stroma)
        submit_resp = client.post(
            f"/api/v1/documents/{doc_id}/quiz/{quiz_res_id}/submit",
            json={"answers": {"mcq1": 1, "mcq2": 0}},
            headers=auth_headers,
        )
        assert submit_resp.status_code == 200
        res = submit_resp.json()
        assert res["total_questions"] == 2
        assert res["correct_answers"] == 1
        assert res["score_percentage"] == 50.0
        assert "attempt_id" in res and res["attempt_id"] is not None
        attempt_id = res["attempt_id"]

        # Check list of attempts
        history_resp = client.get(f"/api/v1/documents/{doc_id}/quiz-attempts", headers=auth_headers)
        assert history_resp.status_code == 200
        attempts = history_resp.json()
        assert len(attempts) == 1
        assert attempts[0]["id"] == attempt_id
        assert attempts[0]["score_percentage"] == 50.0
        assert attempts[0]["correct_answers"] == 1

        # Retrieve full attempt details
        detail_resp = client.get(f"/api/v1/documents/{doc_id}/quiz-attempts/{attempt_id}", headers=auth_headers)
        assert detail_resp.status_code == 200
        detail = detail_resp.json()
        assert detail["id"] == attempt_id
        assert detail["submitted_answers"] == {"mcq1": 1, "mcq2": 0}
        assert len(detail["graded_result"]) == 2

    def test_multiple_quiz_attempts_recorded_separately(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        import time

        doc_id = sample_study_environment["document"].id
        quiz_res_id = sample_study_environment["quiz"].id

        # Attempt 1: 0% correct
        client.post(
            f"/api/v1/documents/{doc_id}/quiz/{quiz_res_id}/submit",
            json={"answers": {"mcq1": 0, "mcq2": 0}},
            headers=auth_headers,
        )
        time.sleep(0.02)
        # Attempt 2: 100% correct
        client.post(
            f"/api/v1/documents/{doc_id}/quiz/{quiz_res_id}/submit",
            json={"answers": {"mcq1": 1, "mcq2": 2}},
            headers=auth_headers,
        )

        history_resp = client.get(f"/api/v1/documents/{doc_id}/quiz-attempts", headers=auth_headers)
        attempts = history_resp.json()
        assert len(attempts) == 2
        # Newest first
        assert attempts[0]["score_percentage"] == 100.0
        assert attempts[1]["score_percentage"] == 0.0

    def test_quiz_attempt_user_isolation(
        self,
        client: TestClient,
        sample_study_environment: dict[str, Any],
        auth_headers: dict[str, str],
        other_auth_headers: dict[str, str],
    ) -> None:
        doc_id = sample_study_environment["document"].id
        quiz_res_id = sample_study_environment["quiz"].id

        # Owner submits quiz
        sub_resp = client.post(
            f"/api/v1/documents/{doc_id}/quiz/{quiz_res_id}/submit",
            json={"answers": {"mcq1": 1, "mcq2": 2}},
            headers=auth_headers,
        )
        attempt_id = sub_resp.json()["attempt_id"]

        # Other user cannot list or fetch this attempt
        assert client.get(f"/api/v1/documents/{doc_id}/quiz-attempts", headers=other_auth_headers).status_code == 404
        assert client.get(f"/api/v1/documents/{doc_id}/quiz-attempts/{attempt_id}", headers=other_auth_headers).status_code == 404


# =============================================================================
# 4. Progress Overview Tests
# =============================================================================


class TestStudyProgressOverviewAPI:
    def test_progress_overview_aggregations(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id
        fc_res_id = sample_study_environment["flashcards"].id
        q_res_id = sample_study_environment["questions"].id
        quiz_res_id = sample_study_environment["quiz"].id

        # 1. Review 2 flashcards: 1 mastered (level 3), 1 learning (level 1)
        for _ in range(3):
            client.put(
                f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc1/progress",
                json={"result": "known"},
                headers=auth_headers,
            )
        client.put(
            f"/api/v1/documents/{doc_id}/flashcards/{fc_res_id}/fc2/progress",
            json={"result": "learning"},
            headers=auth_headers,
        )

        # 2. Bookmark 1 question
        client.post(
            f"/api/v1/documents/{doc_id}/bookmarks",
            json={"resource_id": str(q_res_id), "question_id": "q1"},
            headers=auth_headers,
        )

        # 3. Complete 1 quiz attempt with 100%
        client.post(
            f"/api/v1/documents/{doc_id}/quiz/{quiz_res_id}/submit",
            json={"answers": {"mcq1": 1, "mcq2": 2}},
            headers=auth_headers,
        )

        # 4. Query progress overview
        resp = client.get(f"/api/v1/documents/{doc_id}/study-progress", headers=auth_headers)
        assert resp.status_code == 200
        overview = resp.json()
        assert overview["document_id"] == str(doc_id)
        assert overview["total_flashcards"] == 3
        assert overview["reviewed_flashcards"] == 2
        assert overview["mastered_flashcards"] == 1
        assert overview["learning_flashcards"] == 1
        assert overview["bookmarked_questions_count"] == 1
        assert overview["quiz_attempts_count"] == 1
        assert overview["latest_quiz_score"] == 100.0
        assert overview["best_quiz_score"] == 100.0
        assert overview["last_studied_at"] is not None


# =============================================================================
# 5. Search Across Generated Materials Tests
# =============================================================================


class TestStudySearchAPI:
    def test_search_notes_content(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id

        resp = client.get(f"/api/v1/documents/{doc_id}/search?q=thylakoid", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_results"] > 0
        matches = data["results"]
        # Thylakoid appears in notes and flashcards
        notes_matches = [m for m in matches if m["resource_type"] == "notes"]
        assert len(notes_matches) >= 1
        assert "thylakoid" in notes_matches[0]["snippet"].lower()

    def test_search_questions_content(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id

        resp = client.get(f"/api/v1/documents/{doc_id}/search?q=Calvin", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        q_matches = [m for m in data["results"] if m["resource_type"] == "questions"]
        assert len(q_matches) >= 1

    def test_search_no_results(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id

        resp = client.get(f"/api/v1/documents/{doc_id}/search?q=quantum_teleportation_xyz", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["total_results"] == 0
        assert resp.json()["results"] == []

    def test_search_never_leaks_quiz_answer_keys(
        self, client: TestClient, sample_study_environment: dict[str, Any], auth_headers: dict[str, str]
    ) -> None:
        doc_id = sample_study_environment["document"].id

        # Search for explanation keyword in quiz explanation ("oxygen-evolving complex")
        resp = client.get(f"/api/v1/documents/{doc_id}/search?q=oxygen-evolving", headers=auth_headers)
        assert resp.status_code == 200
        # Must NOT match quiz explanation! Answer keys remain secret before submission!
        quiz_matches = [m for m in resp.json()["results"] if m["resource_type"] == "quiz"]
        assert len(quiz_matches) == 0
