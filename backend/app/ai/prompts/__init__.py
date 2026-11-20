"""Prompt templates for AI-generated study resources."""

from app.ai.prompts.flashcards import build_flashcards_prompt
from app.ai.prompts.notes import build_notes_prompt
from app.ai.prompts.quiz import build_quiz_prompt
from app.ai.prompts.questions import build_questions_prompt
from app.ai.prompts.summary import build_summary_prompt

__all__ = [
    "build_flashcards_prompt",
    "build_notes_prompt",
    "build_quiz_prompt",
    "build_questions_prompt",
    "build_summary_prompt",
]

