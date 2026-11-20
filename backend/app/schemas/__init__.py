"""Pydantic schemas for request and response validation."""

from app.schemas.auth import AuthenticatedUser, MeResponse
from app.schemas.document import (
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentResponse,
)
from app.schemas.study_resource import (
    DocumentGenerationStatusResponse,
    GenerateResourcesRequest,
    GenerateResourcesResponse,
    GenerationStatusItem,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
    StudyResourceJobResponse,
    StudyResourceResponse,
)
from app.schemas.user import UserProfileResponse

__all__ = [
    "AuthenticatedUser",
    "DocumentDeleteResponse",
    "DocumentGenerationStatusResponse",
    "DocumentListResponse",
    "DocumentResponse",
    "GenerateResourcesRequest",
    "GenerateResourcesResponse",
    "GenerationStatusItem",
    "MeResponse",
    "QuizSubmissionRequest",
    "QuizSubmissionResponse",
    "StudyResourceJobResponse",
    "StudyResourceResponse",
    "UserProfileResponse",
]
