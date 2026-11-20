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
from app.schemas.teacher import (
    ExplanationDepth,
    PreferredLanguage,
    TeacherConversationCreate,
    TeacherConversationDetailResponse,
    TeacherConversationListResponse,
    TeacherConversationResponse,
    TeacherConversationUpdate,
    TeacherMessageResponse,
    TeacherMessageSend,
    TeachingMode,
)
from app.schemas.user import UserProfileResponse

__all__ = [
    "AuthenticatedUser",
    "DocumentDeleteResponse",
    "DocumentGenerationStatusResponse",
    "DocumentListResponse",
    "DocumentResponse",
    "ExplanationDepth",
    "GenerateResourcesRequest",
    "GenerateResourcesResponse",
    "GenerationStatusItem",
    "MeResponse",
    "PreferredLanguage",
    "QuizSubmissionRequest",
    "QuizSubmissionResponse",
    "StudyResourceJobResponse",
    "StudyResourceResponse",
    "TeacherConversationCreate",
    "TeacherConversationDetailResponse",
    "TeacherConversationListResponse",
    "TeacherConversationResponse",
    "TeacherConversationUpdate",
    "TeacherMessageResponse",
    "TeacherMessageSend",
    "TeachingMode",
    "UserProfileResponse",
]
