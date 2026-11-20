"""Tests for AI structured generation schemas and validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.ai.schemas import (
    FlashcardsContent,
    NotesContent,
    QuestionsContent,
    QuizContent,
    SummaryContent,
    sanitize_quiz_content_for_client,
)


class TestNotesSchema:
    def test_valid_notes_schema(self) -> None:
        data = {
            "title": "Life Processes",
            "overview": "Overview of living organisms and metabolism.",
            "sections": [
                {
                    "heading": "Autotrophic Nutrition",
                    "content": "Plants synthesize nutrients from CO2 and water via photosynthesis.",
                    "key_points": [
                        "Light energy absorbed by chlorophyll",
                        "Water split into hydrogen and oxygen",
                    ],
                    "source_pages": [1, 2],
                }
            ],
            "key_terms": [
                {
                    "term": "Chloroplast",
                    "definition": "Organelle where photosynthesis takes place.",
                    "source_pages": [2],
                }
            ],
        }
        validated = NotesContent.model_validate(data)
        assert validated.title == "Life Processes"
        assert len(validated.sections) == 1
        assert len(validated.key_terms) == 1

    def test_empty_sections_rejected(self) -> None:
        data = {
            "title": "Life Processes",
            "overview": "Overview text here.",
            "sections": [],
        }
        with pytest.raises(ValidationError):
            NotesContent.model_validate(data)


class TestQuestionsSchema:
    def test_valid_questions_schema(self) -> None:
        data = {
            "title": "Important Questions",
            "questions": [
                {
                    "id": "q1",
                    "question": "What is the primary role of stomata?",
                    "answer": "Stomata allow gas exchange (CO2/O2) and transpiration.",
                    "answer_type": "short",
                    "difficulty": "easy",
                    "source_pages": [3],
                    "important_points": ["Gas exchange", "Transpiration"],
                }
            ],
        }
        validated = QuestionsContent.model_validate(data)
        assert len(validated.questions) == 1
        assert validated.questions[0].answer_type == "short"

    def test_invalid_difficulty_rejected(self) -> None:
        data = {
            "title": "Questions",
            "questions": [
                {
                    "question": "What is ATP?",
                    "answer": "Energy currency of cell.",
                    "difficulty": "impossible",
                }
            ],
        }
        with pytest.raises(ValidationError):
            QuestionsContent.model_validate(data)


class TestFlashcardsSchema:
    def test_valid_flashcards(self) -> None:
        data = {
            "title": "Biology Flashcards",
            "cards": [
                {
                    "id": "fc1",
                    "front": "What is photosynthesis?",
                    "back": "Conversion of light energy into glucose by plants.",
                    "difficulty": "easy",
                    "source_pages": [1],
                }
            ],
        }
        validated = FlashcardsContent.model_validate(data)
        assert len(validated.cards) == 1
        assert validated.cards[0].front == "What is photosynthesis?"


class TestQuizSchema:
    def test_valid_quiz_schema(self) -> None:
        data = {
            "title": "Practice Quiz",
            "questions": [
                {
                    "id": "mcq1",
                    "question": "Which organelle performs photosynthesis?",
                    "options": [
                        "Mitochondria",
                        "Chloroplast",
                        "Ribosome",
                        "Golgi apparatus",
                    ],
                    "correct_option_index": 1,
                    "explanation": "Chloroplasts contain chlorophyll required for photosynthesis.",
                    "difficulty": "easy",
                    "source_pages": [2],
                }
            ],
        }
        validated = QuizContent.model_validate(data)
        assert len(validated.questions) == 1
        assert validated.questions[0].correct_option_index == 1

    def test_quiz_rejects_non_four_options(self) -> None:
        data = {
            "title": "Practice Quiz",
            "questions": [
                {
                    "question": "Which organelle performs photosynthesis?",
                    "options": ["Mitochondria", "Chloroplast", "Ribosome"],  # only 3!
                    "correct_option_index": 1,
                    "explanation": "Test",
                }
            ],
        }
        with pytest.raises(ValidationError, match="must have exactly 4 options"):
            QuizContent.model_validate(data)

    def test_quiz_rejects_out_of_bounds_correct_index(self) -> None:
        data = {
            "title": "Practice Quiz",
            "questions": [
                {
                    "question": "Which organelle performs photosynthesis?",
                    "options": ["A", "B", "C", "D"],
                    "correct_option_index": 5,  # must be 0..3
                    "explanation": "Test",
                }
            ],
        }
        with pytest.raises(ValidationError):
            QuizContent.model_validate(data)

    def test_sanitize_quiz_hides_answers_and_explanations(self) -> None:
        raw_quiz = {
            "title": "Diagnostic Quiz",
            "questions": [
                {
                    "id": "mcq_1",
                    "question": "Sample Question",
                    "options": ["A", "B", "C", "D"],
                    "correct_option_index": 2,
                    "explanation": "Super secret explanation",
                    "difficulty": "medium",
                    "source_pages": [1],
                }
            ],
        }
        sanitized = sanitize_quiz_content_for_client(raw_quiz)
        assert sanitized is not None
        assert "questions" in sanitized
        q0 = sanitized["questions"][0]
        assert "correct_option_index" not in q0
        assert "explanation" not in q0
        assert q0["id"] == "mcq_1"
        assert q0["options"] == ["A", "B", "C", "D"]


class TestSummarySchema:
    def test_valid_summary_schema(self) -> None:
        data = {
            "title": "Chapter Summary",
            "overview": "Comprehensive overview of life processes.",
            "main_topics": [
                {
                    "topic": "Nutrition",
                    "summary": "Covers autotrophic and heterotrophic modes.",
                    "source_pages": [1, 2],
                }
            ],
            "key_takeaways": [
                "Photosynthesis sustains life",
                "Respiration releases cellular energy",
            ],
            "revision_summary": "In brief, living organisms require nutrition, respiration, and transport to maintain life.",
        }
        validated = SummaryContent.model_validate(data)
        assert validated.title == "Chapter Summary"
        assert len(validated.main_topics) == 1
        assert len(validated.key_takeaways) == 2

