"""Jina AI Embedding provider using external REST API (Phase 10 / Low-Memory Hosting).

Generates high-quality multilingual embeddings (English, Hindi, Hinglish) via Jina AI's
cloud embeddings endpoint (https://api.jina.ai/v1/embeddings).

Avoids heavy local ML libraries (ONNX/PyTorch/FastEmbed) to maintain low memory usage
(<50 MB process RAM) on budget hosts such as Wispbyte.

Privacy Notice:
Document passage chunks and search queries are transmitted to Jina AI's external API
endpoint over TLS for embedding calculation.
"""

from __future__ import annotations

import logging
import time
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

DEFAULT_JINA_MODEL = "jina-embeddings-v3"
DEFAULT_JINA_DIMENSIONS = 1024
DEFAULT_JINA_BASE_URL = "https://api.jina.ai/v1"
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_BATCH_SIZE = 32
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_BACKOFF_FACTOR = 1.0


class JinaEmbeddingProvider(BaseEmbeddingProvider):
    """External embedding provider connecting to Jina AI's Embeddings API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_JINA_BASE_URL,
        model_name: str = DEFAULT_JINA_MODEL,
        dimensions: int = DEFAULT_JINA_DIMENSIONS,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        batch_size: int = DEFAULT_BATCH_SIZE,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_backoff_factor: float = DEFAULT_RETRY_BACKOFF_FACTOR,
    ) -> None:
        if not api_key or not api_key.strip():
            raise EmbeddingConfigurationError("JinaEmbeddingProvider requires a valid API key.")
        if not base_url or not base_url.strip():
            raise EmbeddingConfigurationError("JinaEmbeddingProvider requires a valid base_url.")
        if not model_name or not model_name.strip():
            raise EmbeddingConfigurationError("JinaEmbeddingProvider requires a valid model_name.")

        self._api_key = api_key.strip()
        self._base_url = base_url.rstrip("/")
        self._model_name = model_name.strip()
        self._dimensions = dimensions
        self._timeout_seconds = timeout_seconds
        self._batch_size = max(1, batch_size)
        self._max_retries = max(1, max_retries)
        self._retry_backoff_factor = max(0.1, retry_backoff_factor)

    @property
    def provider_name(self) -> str:
        return "jina"

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._dimensions

    def _get_endpoint(self) -> str:
        if self._base_url.endswith("/embeddings"):
            return self._base_url
        return f"{self._base_url}/embeddings"

    def embed_query(self, text: str) -> list[float]:
        """Generate a dense vector for a single search query using the 'retrieval.query' task.

        Args:
            text: Query string to embed.

        Returns:
            Embedding vector matching self.dimensions.
        """
        if not text or not text.strip():
            raise EmbeddingInputError("Query text cannot be empty.")

        clean_text = text.strip()
        vectors = self._post_embeddings([clean_text], task="retrieval.query")
        if not vectors:
            raise EmbeddingProviderError("Jina API returned no embeddings for query.")
        return vectors[0]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate dense vectors for document passages in bounded batches using 'retrieval.passage'.

        Args:
            texts: List of document strings to embed.

        Returns:
            List of embedding vectors, one per input text.
        """
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
            batch_vectors = self._post_embeddings(batch, task="retrieval.passage")
            all_vectors.extend(batch_vectors)

        return all_vectors

    def _post_embeddings(self, texts: list[str], task: str) -> list[list[float]]:
        """Perform POST request to Jina /embeddings with retries and dimension validation."""
        endpoint = self._get_endpoint()
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self._model_name,
            "task": task,
            "dimensions": self._dimensions,
            "input": texts,
        }

        last_error_text = ""
        last_status_code: int | None = None

        for attempt in range(self._max_retries):
            try:
                with httpx.Client(timeout=self._timeout_seconds) as client:
                    response = client.post(endpoint, headers=headers, json=payload)

                last_status_code = response.status_code

                if response.status_code in (401, 403):
                    raise EmbeddingConfigurationError(
                        f"Jina embedding authentication failed (HTTP {response.status_code}): "
                        "Invalid or missing API key."
                    )

                if response.status_code == 429:
                    last_error_text = response.text
                    retry_after = response.headers.get("Retry-After")
                    delay = (
                        float(retry_after)
                        if retry_after and retry_after.isdigit()
                        else self._retry_backoff_factor * (2**attempt)
                    )
                    if attempt < self._max_retries - 1:
                        logger.warning(
                            "Jina API rate limit (HTTP 429); retrying in %.1fs (attempt %d/%d)",
                            delay,
                            attempt + 1,
                            self._max_retries,
                        )
                        time.sleep(delay)
                        continue
                    raise EmbeddingProviderError(
                        f"Jina embedding rate limit exceeded (HTTP 429): {response.text}"
                    )

                if response.status_code in (500, 502, 503, 504):
                    last_error_text = response.text
                    delay = self._retry_backoff_factor * (2**attempt)
                    if attempt < self._max_retries - 1:
                        logger.warning(
                            "Jina API server error (HTTP %d); retrying in %.1fs (attempt %d/%d)",
                            response.status_code,
                            delay,
                            attempt + 1,
                            self._max_retries,
                        )
                        time.sleep(delay)
                        continue
                    raise EmbeddingProviderError(
                        f"Jina embedding server error (HTTP {response.status_code}): {response.text}"
                    )

                if response.status_code != 200:
                    raise EmbeddingProviderError(
                        f"Jina embedding request failed (HTTP {response.status_code}): {response.text}"
                    )

                data = response.json()
                items = data.get("data", [])
                sorted_items = sorted(items, key=lambda x: x.get("index", 0))

                results: list[list[float]] = []
                for item in sorted_items:
                    raw_emb = item.get("embedding", [])
                    vec = validate_vector(raw_emb, self._dimensions)
                    results.append(vec)

                if len(results) != len(texts):
                    raise EmbeddingProviderError(
                        f"Jina API returned {len(results)} embeddings for {len(texts)} input texts."
                    )

                return results

            except (EmbeddingInputError, EmbeddingConfigurationError, EmbeddingDimensionMismatchError):
                raise
            except httpx.TimeoutException as exc:
                if attempt < self._max_retries - 1:
                    delay = self._retry_backoff_factor * (2**attempt)
                    logger.warning(
                        "Jina embedding request timed out; retrying in %.1fs (attempt %d/%d)",
                        delay,
                        attempt + 1,
                        self._max_retries,
                    )
                    time.sleep(delay)
                    continue
                raise EmbeddingProviderError(f"Jina embedding request timed out: {exc}") from exc
            except httpx.RequestError as exc:
                if attempt < self._max_retries - 1:
                    delay = self._retry_backoff_factor * (2**attempt)
                    logger.warning(
                        "Jina embedding network error (%s); retrying in %.1fs (attempt %d/%d)",
                        type(exc).__name__,
                        delay,
                        attempt + 1,
                        self._max_retries,
                    )
                    time.sleep(delay)
                    continue
                raise EmbeddingProviderError(f"Jina embedding network error: {exc}") from exc

        raise EmbeddingProviderError(
            f"Jina embedding request failed after {self._max_retries} attempts "
            f"(last status: {last_status_code}): {last_error_text}"
        )

