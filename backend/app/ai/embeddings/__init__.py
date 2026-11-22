"""NoteMint embedding provider abstractions (Phase 10)."""

from app.ai.embeddings.base import (
    BaseEmbeddingProvider,
    EmbeddingBatchResult,
    EmbeddingConfigurationError,
    EmbeddingDimensionMismatchError,
    EmbeddingInputError,
    EmbeddingProviderError,
    EmbeddingResult,
    validate_vector,
)
from app.ai.embeddings.gateway_provider import GatewayEmbeddingProvider
from app.ai.embeddings.local_provider import LocalEmbeddingProvider
from app.ai.embeddings.provider_factory import get_embedding_provider

__all__ = [
    "BaseEmbeddingProvider",
    "EmbeddingBatchResult",
    "EmbeddingConfigurationError",
    "EmbeddingDimensionMismatchError",
    "EmbeddingInputError",
    "EmbeddingProviderError",
    "EmbeddingResult",
    "GatewayEmbeddingProvider",
    "LocalEmbeddingProvider",
    "get_embedding_provider",
    "validate_vector",
]

