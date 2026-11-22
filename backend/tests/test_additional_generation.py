"""Comprehensive backend tests for Phase 11: Advanced AI Generation & Custom Practice."""

from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.base import (
    AIAuthenticationError,
    AICompletionResult,
    AIRateLimitError,
    BaseAIProvider,
)
from app.ai.prompts.flashcards import (
    build_flashcards_prompt,
    compute_flashcard_difficulty_distribution,
)
from app.ai.prompts.questions import (
    build_questions_prompt,
    compute_question_difficulty_distribution,
)
from app.ai.prompts.quiz import (
    build_quiz_prompt,
    compute_quiz_difficulty_distribution,
)
from app.db.base import Base
from app.db.dependencies import get_db
from app.dependencies.auth import get_current_user
from app.main import app
from app.models.document import Document, DocumentStatus
from app.models.document_extraction import (
    DocumentExtraction,
    DocumentPage,
    ExtractionStatus,
)
from app.models.study_generation_batch import BatchStatus, StudyGenerationBatch
from app.models.study_progress import FlashcardProgress, QuestionBookmark, QuizAttempt
from app.models.study_resource import (
    ResourceStatus,
    ResourceType,
    StudyResource,
)
from app.models.user import User
from app.schemas.auth import AuthenticatedUser
from app.services.ai_generation_service import (
    DocumentNotFoundError,
    GenerationInProgressError,
    ResourceNotFoundError,
)
from app.services.additional_generation_service import (
    AdditionalGenerationService,
    calculate_token_similarity,
    is_duplicate_item,
    normalize_text_for_dedup,
)
from app.tasks.ai_generation_tasks import execute_additional_generation


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------

@pytest.fixture()
def db_session() -> Session:
    """In-memory SQLite database session with complete schema."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def mock_user(db_session: Session) -> User:
    user = User(
        clerk_user_id="user_ph11_test",
        display_name="Test Student",
        email="student11@example.com",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture()
def mock_document(db_session: Session, mock_user: User) -> Document:
    doc = Document(
        clerk_user_id=mock_user.clerk_user_id,
        original_filename="biology_chapter10.pdf",
        storage_key="test-key-ph11",
        mime_type="application/pdf",
        file_size_bytes=102400,
        status=DocumentStatus.COMPLETED,
        page_count=12,
    )
    db_session.add(doc)
    db_session.flush()

    extraction = DocumentExtraction(
        document_id=doc.id,
        status=ExtractionStatus.COMPLETED,
        total_characters=8000,
    )
    db_session.add(extraction)

    pages = [
        DocumentPage(
            document_id=doc.id,
            page_number=1,
            text="Life processes in living organisms. Nutrition and Photosynthesis: Light and dark reactions in chloroplasts.",
            character_count=110,
            has_text=True,
        ),
        DocumentPage(
            document_id=doc.id,
            page_number=2,
            text="Respiration: Cellular respiration breaks down glucose to release ATP in mitochondria. Aerobic vs anaerobic respiration.",
            character_count=125,
            has_text=True,
        ),
    ]
    db_session.add_all(pages)
    db_session.commit()
    return doc


class MockAIProvider(BaseAIProvider):
    def __init__(self, response_json: dict[str, Any] | None = None) -> None:
        self.response_json = response_json or {}
        self.call_count = 0

    def generate(self, **kwargs: Any) -> AICompletionResult:
        self.call_count += 1
        return AICompletionResult(
            content=json.dumps(self.response_json),
            model="mock-kilo-model",
            input_tokens=150,
            output_tokens=300,
            total_tokens=450,
        )


# -----------------------------------------------------------------------------
# 1. Tests: Difficulty Control & Distribution
# -----------------------------------------------------------------------------

class TestDifficultyDistribution:
    def test_compute_distribution_for_easy_medium_hard(self) -> None:
        assert compute_question_difficulty_distribution(10, "easy") == {"easy": 10}
        assert compute_question_difficulty_distribution(15, "medium") == {"medium": 15}
        assert compute_question_difficulty_distribution(20, "hard") == {"hard": 20}

    def test_compute_distribution_for_random_mixed(self) -> None:
        d10 = compute_question_difficulty_distribution(10, "random")
        assert d10["easy"] == 3
        assert d10["hard"] == 3
        assert d10["medium"] == 4
        assert sum(d10.values()) == 10

        d20 = compute_question_difficulty_distribution(20, "random")
        assert d20["easy"] == 6
        assert d20["hard"] == 6
        assert d20["medium"] == 8
        assert sum(d20.values()) == 20

        d5 = compute_question_difficulty_distribution(5, "random")
        assert sum(d5.values()) == 5
        assert d5["easy"] >= 1 and d5["medium"] >= 1 and d5["hard"] >= 1

    def test_prompts_include_explicit_difficulty_instructions(self) -> None:
        # Easy
        easy_prompt = build_questions_prompt("Bio", "context", count=10, difficulty="easy")
        user_content = easy_prompt[1]["content"]
        assert "ALL 10 questions must be EASY" in user_content
        assert "'difficulty' field must be 'easy'" in user_content

        # Hard
        hard_prompt = build_questions_prompt("Bio", "context", count=10, difficulty="hard")
        assert "ALL 10 questions must be HARD" in hard_prompt[1]["content"]
        assert "multi-step reasoning" in hard_prompt[1]["content"]

        # Random
        mixed_prompt = build_quiz_prompt("Bio", "context", count=10, difficulty="random")
        assert "BALANCED MIX of exactly 10 MCQs" in mixed_prompt[1]["content"]
        assert "3 EASY" in mixed_prompt[1]["content"]
        assert "4 MEDIUM" in mixed_prompt[1]["content"]
        assert "3 HARD" in mixed_prompt[1]["content"]

    def test_prompts_include_topic_focus(self) -> None:
        prompt = build_questions_prompt("Bio", "context", count=5, difficulty="hard", topic="Respiration")
        assert "TOPIC FOCUS: Strictly focus questions on the topic/section 'Respiration'" in prompt[1]["content"]

    def test_prompts_include_duplicate_avoidance_list(self) -> None:
        existing = ["What is photosynthesis?", "Define ATP."]
        prompt = build_flashcards_prompt("Bio", "context", count=5, existing_items=existing)
        assert "DUPLICATE AVOIDANCE" in prompt[1]["content"]
        assert "What is photosynthesis?" in prompt[1]["content"]
        assert "Define ATP." in prompt[1]["content"]


# -----------------------------------------------------------------------------
# 2. Tests: Programmatic Deduplication
# -----------------------------------------------------------------------------

class TestDeduplication:
    def test_normalization(self) -> None:
        assert normalize_text_for_dedup("  What is Photosynthesis?!!  ") == "what is photosynthesis"
        assert normalize_text_for_dedup("Define   Cellular\nRespiration.") == "define cellular respiration"

    def test_exact_and_punctuation_duplicate_detected(self) -> None:
        existing = ["What is photosynthesis?"]
        assert is_duplicate_item("what is photosynthesis", existing) is True
        assert is_duplicate_item("What is photosynthesis?!", existing) is True

    def test_semantic_paraphrase_detected(self) -> None:
        existing = ["What is photosynthesis?"]
        # 'define' is a stop word, so both normalize to token set {'photosynthesis'} -> duplicate
        assert is_duplicate_item("Define photosynthesis.", existing) is True

    def test_distinct_concept_allowed(self) -> None:
        existing = ["What is photosynthesis?"]
        # Conceptually related but distinct aspect
        assert is_duplicate_item("Explain the role of chlorophyll in photosynthesis.", existing) is False
        assert is_duplicate_item("What are the light-independent reactions of photosynthesis?", existing) is False


# -----------------------------------------------------------------------------
# 3. Tests: Additional Generation Service & Batches
# -----------------------------------------------------------------------------

class TestAdditionalGenerationService:
    def test_create_batch_validates_ownership_and_parameters(
        self, db_session: Session, mock_document: Document
    ) -> None:
        service = AdditionalGenerationService(db_session, MockAIProvider())

        # Bad user
        with pytest.raises(DocumentNotFoundError):
            service.create_generation_batch(
                clerk_user_id="wrong_user",
                document_id=mock_document.id,
                resource_type="questions",
            )

        # Invalid difficulty
        with pytest.raises(ValueError, match="Invalid difficulty"):
            service.create_generation_batch(
                clerk_user_id="user_ph11_test",
                document_id=mock_document.id,
                resource_type="questions",
                difficulty="extreme",
            )

        # Count out of bounds
        with pytest.raises(ValueError, match="Requested count must be between"):
            service.create_generation_batch(
                clerk_user_id="user_ph11_test",
                document_id=mock_document.id,
                resource_type="questions",
                count=50,
            )

        # Valid creation
        batch = service.create_generation_batch(
            clerk_user_id="user_ph11_test",
            document_id=mock_document.id,
            resource_type="questions",
            difficulty="hard",
            count=10,
            topic="Photosynthesis",
        )
        assert batch.id is not None
        assert batch.status == BatchStatus.PENDING.value
        assert batch.difficulty == "hard"
        assert batch.requested_count == 10
        assert batch.topic == "Photosynthesis"

    def test_duplicate_concurrent_batch_rejected(
        self, db_session: Session, mock_document: Document
    ) -> None:
        service = AdditionalGenerationService(db_session, MockAIProvider())
        service.create_generation_batch(
            clerk_user_id="user_ph11_test",
            document_id=mock_document.id,
            resource_type="flashcards",
            count=5,
        )

        with pytest.raises(Exception, match="already running"):
            service.create_generation_batch(
                clerk_user_id="user_ph11_test",
                document_id=mock_document.id,
                resource_type="flashcards",
                count=5,
            )

    def test_process_generation_batch_persists_resource_and_updates_batch(
        self, db_session: Session, mock_document: Document
    ) -> None:
        # Create base questions first
        base_res = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.QUESTIONS,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Important Questions",
                "questions": [
                    {
                        "id": "q_orig_1",
                        "question": "What is photosynthesis?",
                        "answer": "Process by which plants convert light to chemical energy.",
                        "answer_type": "short",
                        "difficulty": "easy",
                        "source_pages": [1],
                        "important_points": ["Chloroplast", "Sunlight"],
                    }
                ],
            },
            model_name="test-model",
            prompt_version="v1",
            version=1,
            is_active=True,
        )
        db_session.add(base_res)
        db_session.commit()

        # Mock AI generation returning 2 questions: one new, one duplicate of original
        mock_ai_output = {
            "title": "Additional Questions",
            "questions": [
                {
                    "id": "q1",
                    "question": "Define photosynthesis.",  # Duplicate of q_orig_1!
                    "answer": "Plant light energy conversion.",
                    "answer_type": "short",
                    "difficulty": "hard",
                    "source_pages": [1],
                    "important_points": ["Energy"],
                },
                {
                    "id": "q2",
                    "question": "Explain the role of carbon dioxide fixation in the Calvin cycle.",  # Unique!
                    "answer": "RuBisCO catalyzes the carboxylation of RuBP to produce 3-PGA.",
                    "answer_type": "long",
                    "difficulty": "hard",
                    "source_pages": [1],
                    "important_points": ["RuBisCO", "3-PGA"],
                },
            ],
        }

        provider = MockAIProvider(response_json=mock_ai_output)
        service = AdditionalGenerationService(db_session, provider)

        batch = service.create_generation_batch(
            clerk_user_id="user_ph11_test",
            document_id=mock_document.id,
            resource_type="questions",
            difficulty="hard",
            count=10,
        )

        new_resource = service.process_generation_batch(batch.id)

        assert new_resource is not None
        assert new_resource.resource_type == ResourceType.QUESTIONS
        assert new_resource.generation_batch_id == batch.id
        assert new_resource.difficulty == "hard"

        # Check deduplication: only 1 unique question saved (the duplicate was dropped)
        saved_questions = new_resource.content["questions"]
        assert len(saved_questions) == 1
        assert "Calvin cycle" in saved_questions[0]["question"]
        assert saved_questions[0]["difficulty"] == "hard"
        assert saved_questions[0]["id"].startswith("q_")

        # Check batch state
        updated_batch = service.get_generation_batch("user_ph11_test", mock_document.id, batch.id)
        assert updated_batch.status == BatchStatus.COMPLETED.value
        assert updated_batch.generated_count == 1
        assert updated_batch.resource_id == new_resource.id


# -----------------------------------------------------------------------------
# 4. Tests: Aggregation, Bookmarks, and Quiz Sets
# -----------------------------------------------------------------------------

class TestAggregatedViewsAndProgress:
    def test_aggregated_questions_combines_base_and_batches(
        self, db_session: Session, mock_document: Document
    ) -> None:
        service = AdditionalGenerationService(db_session, MockAIProvider())

        # Base questions
        base_res = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.QUESTIONS,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Base Questions",
                "questions": [
                    {
                        "id": "q_base_1",
                        "question": "What is ATP?",
                        "answer": "Energy currency of cell.",
                        "answer_type": "short",
                        "difficulty": "easy",
                        "source_pages": [2],
                        "important_points": ["Energy"],
                    }
                ],
            },
            model_name="test",
            version=1,
            is_active=True,
        )
        db_session.add(base_res)
        db_session.flush()

        # Batch 1 questions
        batch_id_1 = uuid.uuid4()
        batch_res = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.QUESTIONS,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Batch 1 Questions",
                "questions": [
                    {
                        "id": "q_batch_1",
                        "question": "How does glycolysis produce ATP?",
                        "answer": "Through substrate-level phosphorylation.",
                        "answer_type": "long",
                        "difficulty": "hard",
                        "source_pages": [2],
                        "important_points": ["Phosphorylation"],
                    }
                ],
            },
            model_name="test",
            version=2,
            is_active=True,
            generation_batch_id=batch_id_1,
            difficulty="hard",
        )
        db_session.add(batch_res)
        db_session.commit()

        agg = service.get_aggregated_questions("user_ph11_test", mock_document.id)
        assert agg.total_questions == 2
        assert agg.questions[0].id == "q_base_1"
        assert agg.questions[0].batch_label == "Original"
        assert agg.questions[1].id == "q_batch_1"
        assert agg.questions[1].difficulty == "hard"

        # Bookmark persistence across batches
        db_session.add(
            QuestionBookmark(
                clerk_user_id="user_ph11_test",
                document_id=mock_document.id,
                resource_id=base_res.id,
                question_id="q_base_1",
            )
        )
        db_session.add(
            QuestionBookmark(
                clerk_user_id="user_ph11_test",
                document_id=mock_document.id,
                resource_id=batch_res.id,
                question_id="q_batch_1",
            )
        )
        db_session.commit()

        bookmarks = db_session.query(QuestionBookmark).filter_by(document_id=mock_document.id).all()
        assert len(bookmarks) == 2
        assert {b.question_id for b in bookmarks} == {"q_base_1", "q_batch_1"}

    def test_aggregated_flashcards_preserves_mastery_across_batches(
        self, db_session: Session, mock_document: Document
    ) -> None:
        service = AdditionalGenerationService(db_session, MockAIProvider())

        # Base flashcards
        base_fc = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.FLASHCARDS,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Base Flashcards",
                "cards": [
                    {"id": "fc_1", "front": "Mitochondria", "back": "Powerhouse", "difficulty": "easy", "source_pages": [2]}
                ],
            },
            model_name="test",
            version=1,
            is_active=True,
        )
        db_session.add(base_fc)
        db_session.flush()

        # Mark fc_1 as Mastered (level 3)
        p1 = FlashcardProgress(
            clerk_user_id="user_ph11_test",
            document_id=mock_document.id,
            resource_id=base_fc.id,
            card_id="fc_1",
            mastery_level=3,
            review_count=5,
            correct_count=5,
            incorrect_count=0,
        )
        db_session.add(p1)

        # Batch flashcards
        batch_fc_id = uuid.uuid4()
        batch_fc = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.FLASHCARDS,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Batch Flashcards",
                "cards": [
                    {"id": "fc_2", "front": "Cristae", "back": "Inner foldings", "difficulty": "hard", "source_pages": [2]}
                ],
            },
            model_name="test",
            version=2,
            is_active=True,
            generation_batch_id=batch_fc_id,
            difficulty="hard",
        )
        db_session.add(batch_fc)
        db_session.commit()

        agg = service.get_aggregated_flashcards("user_ph11_test", mock_document.id)
        assert agg.total_cards == 2
        assert {c.id for c in agg.cards} == {"fc_1", "fc_2"}

        # Previous mastery remains intact!
        saved_p1 = db_session.query(FlashcardProgress).filter_by(card_id="fc_1").first()
        assert saved_p1 is not None
        assert saved_p1.mastery_level == 3

    def test_quiz_practice_sets_and_server_side_grading(
        self, db_session: Session, mock_document: Document
    ) -> None:
        service = AdditionalGenerationService(db_session, MockAIProvider())

        # Base quiz (1 question)
        base_quiz = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.QUIZ,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Base Quiz",
                "questions": [
                    {
                        "id": "mcq_1",
                        "question": "Where does cellular respiration occur?",
                        "options": ["Ribosome", "Mitochondria", "Vacuole", "Nucleus"],
                        "correct_option_index": 1,
                        "explanation": "Mitochondria generates ATP through aerobic respiration.",
                        "difficulty": "easy",
                        "source_pages": [2],
                    }
                ],
            },
            model_name="test",
            version=1,
            is_active=True,
        )
        db_session.add(base_quiz)
        db_session.flush()

        # Batch quiz (1 question)
        batch_quiz_id = uuid.uuid4()
        batch_quiz = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.QUIZ,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Hard Quiz",
                "questions": [
                    {
                        "id": "mcq_2",
                        "question": "What is the net yield of ATP from one glucose molecule in aerobic respiration?",
                        "options": ["2 ATP", "4 ATP", "36-38 ATP", "12 ATP"],
                        "correct_option_index": 2,
                        "explanation": "Complete oxidation yields approximately 36 to 38 ATP.",
                        "difficulty": "hard",
                        "source_pages": [2],
                    }
                ],
            },
            model_name="test",
            version=2,
            is_active=True,
            generation_batch_id=batch_quiz_id,
            difficulty="hard",
        )
        db_session.add(batch_quiz)
        db_session.commit()

        # 1. Check aggregated quiz output: answers are SANITIZED
        quiz_resp = service.get_aggregated_quiz("user_ph11_test", mock_document.id)
        assert len(quiz_resp.practice_sets) == 3  # All Questions, Original Quiz, Set 1 (Hard)
        assert quiz_resp.practice_sets[0].set_id == "all"
        assert quiz_resp.practice_sets[0].question_count == 2

        # Verify correct_option_index and explanation are NOT in the questions payload
        raw_dump = [q.model_dump() for q in quiz_resp.questions]
        for q in raw_dump:
            assert "correct_option_index" not in q
            assert "explanation" not in q

        # 2. Grade "all" questions practice set
        submission = service.grade_practice_set_quiz(
            clerk_user_id="user_ph11_test",
            document_id=mock_document.id,
            practice_set_id="all",
            user_answers={"mcq_1": 1, "mcq_2": 0},  # 1 correct, 1 wrong
        )
        assert submission.total_questions == 2
        assert submission.correct_answers == 1
        assert submission.score_percentage == 50.0
        assert submission.results[0].is_correct is True
        assert submission.results[1].is_correct is False
        assert submission.results[1].correct_option_index == 2
        assert "36 to 38 ATP" in submission.results[1].explanation

        # 3. Check attempt was persisted in history
        attempt = db_session.query(QuizAttempt).filter_by(id=submission.attempt_id).first()
        assert attempt is not None
        assert attempt.total_questions == 2
        assert attempt.score_percentage == 50.0


# -----------------------------------------------------------------------------
# 5. Tests: Fast API HTTP Endpoints
# -----------------------------------------------------------------------------

class TestAPIEndpoints:
    @pytest.fixture()
    def client(self, db_session: Session) -> TestClient:
        app.dependency_overrides[get_db] = lambda: db_session
        app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
            user_id="user_ph11_test",
            session_id="test_sess",
        )
        client = TestClient(app)
        yield client
        app.dependency_overrides.clear()

    def test_generate_more_endpoint_accepted(
        self, client: TestClient, mock_document: Document
    ) -> None:
        with patch("app.api.v1.additional_generation.enqueue_additional_generation_task") as mock_enqueue:
            mock_enqueue.return_value = True
            response = client.post(
                f"/api/v1/documents/{mock_document.id}/generate-more",
                json={
                    "resource_type": "questions",
                    "difficulty": "hard",
                    "count": 10,
                    "topic": "Cellular Respiration",
                },
            )
            assert response.status_code == 202
            data = response.json()
            assert data["difficulty"] == "hard"
            assert data["requested_count"] == 10
            assert data["topic"] == "Cellular Respiration"
            assert data["status"] == "pending"
            assert mock_enqueue.called

    def test_list_and_get_batches_endpoints(
        self, client: TestClient, db_session: Session, mock_document: Document
    ) -> None:
        batch = StudyGenerationBatch(
            document_id=mock_document.id,
            resource_type="flashcards",
            difficulty="easy",
            requested_count=5,
            generated_count=5,
            status=BatchStatus.COMPLETED.value,
            model_name="mock-model",
            prompt_version="v1",
        )
        db_session.add(batch)
        db_session.commit()

        # List
        resp = client.get(f"/api/v1/documents/{mock_document.id}/generation-batches")
        assert resp.status_code == 200
        list_data = resp.json()
        assert list_data["total"] == 1
        assert list_data["items"][0]["id"] == str(batch.id)

        # Get
        single_resp = client.get(f"/api/v1/documents/{mock_document.id}/generation-batches/{batch.id}")
        assert single_resp.status_code == 200
        assert single_resp.json()["id"] == str(batch.id)

    def test_get_available_topics(
        self, client: TestClient, db_session: Session, mock_document: Document
    ) -> None:
        notes = StudyResource(
            document_id=mock_document.id,
            resource_type=ResourceType.NOTES,
            status=ResourceStatus.COMPLETED,
            content={
                "title": "Notes",
                "sections": [
                    {"heading": "Aerobic Respiration", "content": "Details here...", "source_pages": [2]}
                ],
            },
            model_name="test",
            version=1,
            is_active=True,
        )
        db_session.add(notes)
        db_session.commit()

        resp = client.get(f"/api/v1/documents/{mock_document.id}/topics")
        assert resp.status_code == 200
        data = resp.json()
        assert "Aerobic Respiration" in data["topics"]


# -----------------------------------------------------------------------------
# 6. Tests: Celery Task Execution & Resilience
# -----------------------------------------------------------------------------

class TestCeleryExecution:
    def test_execute_additional_generation_success(
        self, db_session: Session, mock_document: Document
    ) -> None:
        batch = StudyGenerationBatch(
            document_id=mock_document.id,
            resource_type="flashcards",
            difficulty="easy",
            requested_count=5,
            status=BatchStatus.PENDING.value,
            model_name="mock-model",
            prompt_version="v1",
        )
        db_session.add(batch)
        db_session.commit()
        saved_batch_id = batch.id

        mock_content = {
            "title": "Flashcards",
            "cards": [
                {"id": "fc1", "front": "Glucose", "back": "C6H12O6", "difficulty": "easy", "source_pages": [1]}
            ],
        }

        with patch("app.tasks.ai_generation_tasks.get_session_factory") as mock_sf, \
             patch("app.tasks.ai_generation_tasks.get_ai_provider") as mock_gp:
            mock_sf.return_value = lambda: db_session
            mock_gp.return_value = MockAIProvider(response_json=mock_content)

            result = execute_additional_generation(
                document_id_str=str(mock_document.id),
                batch_id_str=str(saved_batch_id),
            )
            assert result["status"] == "success"
            assert result["resource_type"] == "flashcards"

            # Verify batch status in DB
            batch_in_db = db_session.get(StudyGenerationBatch, saved_batch_id)
            assert batch_in_db is not None
            assert batch_in_db.status == BatchStatus.COMPLETED.value
            assert batch_in_db.generated_count == 1

    def test_execute_additional_generation_permanent_error_no_retry(
        self, db_session: Session, mock_document: Document
    ) -> None:
        batch = StudyGenerationBatch(
            document_id=mock_document.id,
            resource_type="quiz",
            difficulty="hard",
            requested_count=5,
            status=BatchStatus.PENDING.value,
            model_name="mock-model",
            prompt_version="v1",
        )
        db_session.add(batch)
        db_session.commit()
        saved_batch_id = batch.id

        class FailingProvider(BaseAIProvider):
            def generate(self, **kwargs: Any) -> AICompletionResult:
                raise AIAuthenticationError("Invalid API key")

        with patch("app.tasks.ai_generation_tasks.get_session_factory") as mock_sf, \
             patch("app.tasks.ai_generation_tasks.get_ai_provider") as mock_gp:
            mock_sf.return_value = lambda: db_session
            mock_gp.return_value = FailingProvider()

            result = execute_additional_generation(
                document_id_str=str(mock_document.id),
                batch_id_str=str(saved_batch_id),
            )
            assert result["status"] == "failed"
            assert result["permanent"] is True

            batch_in_db = db_session.get(StudyGenerationBatch, saved_batch_id)
            assert batch_in_db is not None
            assert batch_in_db.status == BatchStatus.FAILED.value
            assert "Invalid API key" in str(batch_in_db.error_message)
