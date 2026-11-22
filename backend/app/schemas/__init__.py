"""Pydantic schemas for request and response validation."""

from app.schemas.additional_generation import (
    AggregatedFlashcardsResponse,
    AggregatedQuestionsResponse,
    AggregatedQuizResponse,
    AvailableTopicsResponse,
    GenerateMoreRequest,
    StudyGenerationBatchListResponse,
    StudyGenerationBatchResponse,
    SubmitPracticeSetQuizRequest,
)
from app.schemas.auth import AuthenticatedUser, MeResponse
from app.schemas.document import (
    DocumentDeleteResponse,
    DocumentListResponse,
    DocumentResponse,
)
from app.schemas.rag import (
    DocumentIndexStatusResponse,
    DocumentReindexResponse,
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
    "AggregatedFlashcardsResponse",
    "AggregatedQuestionsResponse",
    "AggregatedQuizResponse",
    "AuthenticatedUser",
    "AvailableTopicsResponse",
    "DocumentDeleteResponse",
    "DocumentGenerationStatusResponse",
    "DocumentIndexStatusResponse",
    "DocumentListResponse",
    "DocumentReindexResponse",
    "DocumentResponse",
    "ExplanationDepth",
    "GenerateMoreRequest",
    "GenerateResourcesRequest",
    "GenerateResourcesResponse",
    "GenerationStatusItem",
    "MeResponse",
    "PreferredLanguage",
    "QuizSubmissionRequest",
    "QuizSubmissionResponse",
    "StudyGenerationBatchListResponse",
    "StudyGenerationBatchResponse",
    "StudyResourceJobResponse",
    "StudyResourceResponse",
    "SubmitPracticeSetQuizRequest",
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
