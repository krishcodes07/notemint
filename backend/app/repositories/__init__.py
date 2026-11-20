"""Repository layer (data access, no business logic)."""

from app.repositories.document_repository import DocumentRepository
from app.repositories.extraction_repository import ExtractionRepository
from app.repositories.study_progress_repository import StudyProgressRepository
from app.repositories.study_resource_repository import StudyResourceRepository
from app.repositories.teacher_repository import TeacherRepository
from app.repositories.user_repository import UserRepository

__all__ = [
    "DocumentRepository",
    "ExtractionRepository",
    "StudyProgressRepository",
    "StudyResourceRepository",
    "TeacherRepository",
    "UserRepository",
]
