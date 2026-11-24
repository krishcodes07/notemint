"""Embedding provider factory resolving active provider based on application configuration."""

from __future__ import annotations

import logging

from app.ai.embeddings.base import BaseEmbeddingProvider, EmbeddingConfigurationError
from app.ai.embeddings.gateway_provider import GatewayEmbeddingProvider
from app.ai.embeddings.jina_provider import (
    DEFAULT_JINA_DIMENSIONS,
    DEFAULT_JINA_MODEL,
    JinaEmbeddingProvider,
)
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
        provider_name: 'jina' (default), 'gateway', or 'local'.
        model_name: Model identifier (defaults to settings.embedding_model).
        dimensions: Vector dimensions (defaults to settings.embedding_dimensions).

    Returns:
        Instance of BaseEmbeddingProvider.
    """
    resolved_provider = (provider_name or getattr(settings, "embedding_provider", "jina")).lower()

    if resolved_provider == "jina":
        resolved_model = model_name or getattr(settings, "embedding_model", DEFAULT_JINA_MODEL)
        resolved_dims = dimensions or getattr(settings, "embedding_dimensions", DEFAULT_JINA_DIMENSIONS)
        api_key = getattr(settings, "jina_api_key", "")
        if not api_key:
            raise EmbeddingConfigurationError(
                "Jina embedding provider selected but JINA_API_KEY is not configured."
            )
        return JinaEmbeddingProvider(
            api_key=api_key,
            base_url=getattr(settings, "jina_base_url", "https://api.jina.ai/v1"),
            model_name=resolved_model,
            dimensions=resolved_dims,
            timeout_seconds=getattr(settings, "jina_timeout_seconds", 30.0),
            batch_size=getattr(settings, "rag_index_batch_size", 32),
            max_retries=getattr(settings, "jina_max_retries", 3),
        )

    if resolved_provider == "gateway":
        resolved_model = model_name or getattr(settings, "embedding_model", DEFAULT_LOCAL_MODEL)
        resolved_dims = dimensions or getattr(settings, "embedding_dimensions", DEFAULT_LOCAL_DIMENSIONS)
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

    if resolved_provider == "local":
        resolved_model = model_name or DEFAULT_LOCAL_MODEL
        resolved_dims = dimensions or DEFAULT_LOCAL_DIMENSIONS
        return LocalEmbeddingProvider(
            model_name=resolved_model,
            expected_dimensions=resolved_dims,
            batch_size=getattr(settings, "rag_index_batch_size", 32),
        )

    raise EmbeddingConfigurationError(f"Unknown embedding provider: '{resolved_provider}'")
