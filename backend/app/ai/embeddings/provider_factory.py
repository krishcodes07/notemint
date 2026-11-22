"""Embedding provider factory resolving active provider based on application configuration."""

from __future__ import annotations

import logging
from functools import lru_cache

from app.ai.embeddings.base import BaseEmbeddingProvider, EmbeddingConfigurationError
from app.ai.embeddings.gateway_provider import GatewayEmbeddingProvider
from app.ai.embeddings.local_provider import (
    DEFAULT_LOCAL_DIMENSIONS,
    DEFAULT_LOCAL_MODEL,
    LocalEmbeddingProvider,
)
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_embedding_provider(
    provider_name: str | None = None,
    model_name: str | None = None,
    dimensions: int | None = None,
) -> BaseEmbeddingProvider:
    """Instantiate and return the configured embedding provider.

    Args:
        provider_name: 'local' or 'gateway' (defaults to settings.embedding_provider).
        model_name: Model identifier (defaults to settings.embedding_model).
        dimensions: Vector dimensions (defaults to settings.embedding_dimensions).

    Returns:
        Instance of BaseEmbeddingProvider.
    """
    resolved_provider = (provider_name or getattr(settings, "embedding_provider", "local")).lower()
    resolved_model = model_name or getattr(settings, "embedding_model", DEFAULT_LOCAL_MODEL)
    resolved_dims = dimensions or getattr(settings, "embedding_dimensions", DEFAULT_LOCAL_DIMENSIONS)

    if resolved_provider == "gateway":
        api_key = getattr(settings, "kilo_api_key", "")
        base_url = getattr(settings, "kilo_base_url", "")
        if not api_key:
            raise EmbeddingConfigurationError(
                "Gateway embedding provider selected but KILO_API_KEY is not configured."
            )
        return GatewayEmbeddingProvider(
            api_key=api_key,
            base_url=base_url,
            model_name=resolved_model,
            expected_dimensions=resolved_dims,
        )

    # Default: local FastEmbed provider
    return LocalEmbeddingProvider(
        model_name=resolved_model,
        expected_dimensions=resolved_dims,
        batch_size=getattr(settings, "rag_index_batch_size", 32),
    )

