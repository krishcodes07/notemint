"""Local embedding provider using FastEmbed (ONNX Runtime) (Phase 10).

Runs lightweight, high-performance dense embedding models locally on CPU without
PyTorch dependencies, producing verified 384-dimensional vectors.
"""

from __future__ import annotations

import logging
from typing import Sequence

from app.ai.embeddings.base import (
    BaseEmbeddingProvider,
    EmbeddingDimensionMismatchError,
    EmbeddingInputError,
    EmbeddingProviderError,
    validate_vector,
)

logger = logging.getLogger(__name__)

# Default model: BAAI/bge-small-en-v1.5 (dimension 384, max length 512 tokens)
DEFAULT_LOCAL_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_LOCAL_DIMENSIONS = 384


class LocalEmbeddingProvider(BaseEmbeddingProvider):
    """Local embedding generator using FastEmbed ONNX runtime."""

    _cached_models: dict[str, object] = {}

    def __init__(
        self,
        model_name: str | None = None,
        expected_dimensions: int | None = None,
        batch_size: int = 32,
    ) -> None:
        self._model_name = model_name or DEFAULT_LOCAL_MODEL
        self._expected_dimensions = expected_dimensions or DEFAULT_LOCAL_DIMENSIONS
        self._batch_size = max(1, batch_size)
        self._model = self._get_or_init_model(self._model_name)

    @classmethod
    def _get_or_init_model(cls, model_name: str) -> object:
        """Cache model instance so it is loaded once per process."""
        if model_name in cls._cached_models:
            return cls._cached_models[model_name]

        try:
            from fastembed import TextEmbedding

            logger.info("Initializing FastEmbed TextEmbedding with model: %s", model_name)
            model = TextEmbedding(model_name=model_name)
            cls._cached_models[model_name] = model
            return model
        except Exception as exc:
            logger.error("Failed to load FastEmbed model %s: %s", model_name, exc)
            raise EmbeddingProviderError(
                f"Could not initialize local embedding model '{model_name}': {exc}"
            ) from exc

    @property
    def provider_name(self) -> str:
        return "local"

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._expected_dimensions

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query."""
        if not text or not text.strip():
            raise EmbeddingInputError("Query text cannot be empty.")

        clean_text = text.strip()
        try:
            embeddings_iter = self._model.embed([clean_text])
            raw_vector = next(iter(embeddings_iter))
            return validate_vector(list(raw_vector), self._expected_dimensions)
        except (EmbeddingInputError, EmbeddingDimensionMismatchError):
            raise
        except Exception as exc:
            logger.error("Error generating query embedding for %r: %s", clean_text[:40], exc)
            raise EmbeddingProviderError(f"Local query embedding failed: {exc}") from exc

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of document passages in batches."""
        if not texts:
            return []

        cleaned_texts: list[str] = []
        for i, t in enumerate(texts):
            if not t or not t.strip():
                raise EmbeddingInputError(f"Document text at index {i} cannot be empty.")
            cleaned_texts.append(t.strip())

        results: list[list[float]] = []
        try:
            # FastEmbed handles batching natively
            embeddings_iter = self._model.embed(cleaned_texts, batch_size=self._batch_size)
            for raw_vector in embeddings_iter:
                vector = validate_vector(list(raw_vector), self._expected_dimensions)
                results.append(vector)
            return results
        except (EmbeddingInputError, EmbeddingDimensionMismatchError):
            raise
        except Exception as exc:
            logger.error("Error generating batch document embeddings (%d texts): %s", len(texts), exc)
            raise EmbeddingProviderError(f"Local document batch embedding failed: {exc}") from exc

