"""Gateway/HTTP embedding provider for OpenAI-compatible APIs (Phase 10).

Connects to OpenAI-compatible `/embeddings` endpoints (such as Kilo Gateway if supported,
or external embedding gateways).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.ai.embeddings.base import (
    BaseEmbeddingProvider,
    EmbeddingConfigurationError,
    EmbeddingDimensionMismatchError,
    EmbeddingInputError,
    EmbeddingProviderError,
    validate_vector,
)

logger = logging.getLogger(__name__)


class GatewayEmbeddingProvider(BaseEmbeddingProvider):
    """Embedding provider connecting to an OpenAI-compatible /v1/embeddings HTTP API."""

    def __init__(
        self,
        api_key: str,
        base_url: str,
        model_name: str,
        expected_dimensions: int,
        timeout_seconds: float = 30.0,
        batch_size: int = 32,
    ) -> None:
        if not api_key:
            raise EmbeddingConfigurationError("GatewayEmbeddingProvider requires an API key.")
        if not base_url:
            raise EmbeddingConfigurationError("GatewayEmbeddingProvider requires a base_url.")
        if not model_name:
            raise EmbeddingConfigurationError("GatewayEmbeddingProvider requires a model_name.")

        self._api_key = api_key
        # Strip trailing slash
        self._base_url = base_url.rstrip("/")
        self._model_name = model_name
        self._expected_dimensions = expected_dimensions
        self._timeout_seconds = timeout_seconds
        self._batch_size = max(1, batch_size)

    @property
    def provider_name(self) -> str:
        return "gateway"

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._expected_dimensions

    def _get_endpoint(self) -> str:
        if self._base_url.endswith("/embeddings"):
            return self._base_url
        return f"{self._base_url}/embeddings"

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query via the HTTP gateway."""
        if not text or not text.strip():
            raise EmbeddingInputError("Query text cannot be empty.")

        vectors = self._post_embeddings([text.strip()])
        if not vectors:
            raise EmbeddingProviderError("Gateway returned no embeddings for query.")
        return vectors[0]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed document passages in batches via the HTTP gateway."""
        if not texts:
            return []

        cleaned: list[str] = []
        for i, t in enumerate(texts):
            if not t or not t.strip():
                raise EmbeddingInputError(f"Document text at index {i} cannot be empty.")
            cleaned.append(t.strip())

        all_vectors: list[list[float]] = []
        # Chunk into bounded batches
        for i in range(0, len(cleaned), self._batch_size):
            batch = cleaned[i : i + self._batch_size]
            batch_vectors = self._post_embeddings(batch)
            all_vectors.extend(batch_vectors)

        return all_vectors

    def _post_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Perform POST request to /embeddings and parse vector outputs."""
        endpoint = self._get_endpoint()
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "input": texts,
            "model": self._model_name,
        }

        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.post(endpoint, headers=headers, json=payload)

            if response.status_code == 401 or response.status_code == 403:
                raise EmbeddingConfigurationError(
                    f"Gateway embedding authentication failed (HTTP {response.status_code})"
                )
            if response.status_code == 429:
                raise EmbeddingProviderError(
                    f"Gateway embedding rate limit exceeded (HTTP 429): {response.text}"
                )
            if response.status_code != 200:
                raise EmbeddingProviderError(
                    f"Gateway embedding request failed (HTTP {response.status_code}): {response.text}"
                )

            data = response.json()
            items = data.get("data", [])
            # Sort by index if present
            sorted_items = sorted(items, key=lambda x: x.get("index", 0))

            results: list[list[float]] = []
            for item in sorted_items:
                raw_emb = item.get("embedding", [])
                vec = validate_vector(raw_emb, self._expected_dimensions)
                results.append(vec)

            if len(results) != len(texts):
                raise EmbeddingProviderError(
                    f"Gateway returned {len(results)} embeddings for {len(texts)} input texts."
                )

            return results
        except (EmbeddingInputError, EmbeddingConfigurationError, EmbeddingDimensionMismatchError):
            raise
        except httpx.TimeoutException as exc:
            raise EmbeddingProviderError(f"Gateway embedding request timed out: {exc}") from exc
        except Exception as exc:
            logger.error("Gateway embedding request error: %s", exc)
            raise EmbeddingProviderError(f"Gateway embedding request failed: {exc}") from exc

