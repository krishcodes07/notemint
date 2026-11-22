"""Base embedding provider interfaces and exceptions for NoteMint (Phase 10).

Defines an independent provider abstraction for dense vector embedding generation.
Embeddings are separate from text generation / chat completions.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Sequence


class EmbeddingProviderError(Exception):
    """Base exception for all embedding generation errors."""


class EmbeddingConfigurationError(EmbeddingProviderError):
    """Raised when an embedding provider is misconfigured or missing credentials."""


class EmbeddingDimensionMismatchError(EmbeddingProviderError):
    """Raised when generated embeddings do not match the expected vector dimension."""


class EmbeddingInputError(EmbeddingProviderError):
    """Raised when input text is invalid (e.g. empty, none, or exceeding length limits)."""


@dataclass(frozen=True)
class EmbeddingResult:
    """Vector embedding for a single text input."""

    vector: list[float]
    model_name: str
    dimension: int


@dataclass(frozen=True)
class EmbeddingBatchResult:
    """Batch of vector embeddings with metadata."""

    vectors: list[list[float]]
    model_name: str
    dimension: int
    count: int


def validate_vector(vector: Sequence[float], expected_dimension: int | None = None) -> list[float]:
    """Validate that a vector contains valid finite numbers and matches expected dimension."""
    if not vector:
        raise EmbeddingProviderError("Vector cannot be empty.")

    out: list[float] = []
    for i, val in enumerate(vector):
        try:
            f_val = float(val)
        except (ValueError, TypeError):
            raise EmbeddingProviderError(f"Vector contains invalid float at index {i}: {val}")

        if math.isnan(f_val) or math.isinf(f_val):
            raise EmbeddingProviderError(f"Vector contains invalid float at index {i}: {val}")
        out.append(f_val)

    if expected_dimension is not None and len(out) != expected_dimension:
        raise EmbeddingDimensionMismatchError(
            f"Expected embedding dimension {expected_dimension}, got {len(out)}"
        )

    return out


class BaseEmbeddingProvider(ABC):
    """Abstract base class for all embedding providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g. 'local', 'gateway')."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name or identifier of the underlying model."""

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Dimensionality of vectors produced by this model."""

    @abstractmethod
    def embed_query(self, text: str) -> list[float]:
        """Generate a dense vector for a single search query.

        Args:
            text: Query string to embed.

        Returns:
            List of floats representing the embedding vector.
        """

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate dense vectors for a list of document passages.

        Args:
            texts: List of document strings to embed.

        Returns:
            List of embedding vectors, one per input text.
        """
