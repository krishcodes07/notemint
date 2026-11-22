"""Unit tests for embedding providers and factory (Phase 10)."""

from __future__ import annotations

import math
import pytest
import httpx

from app.ai.embeddings.base import (
    EmbeddingConfigurationError,
    EmbeddingDimensionMismatchError,
    EmbeddingInputError,
    EmbeddingProviderError,
    validate_vector,
)
from app.ai.embeddings.gateway_provider import GatewayEmbeddingProvider
from app.ai.embeddings.local_provider import LocalEmbeddingProvider
from app.ai.embeddings.provider_factory import get_embedding_provider


class TestVectorValidation:
    def test_valid_vector(self) -> None:
        vec = [0.1, -0.2, 0.5, 1.0]
        out = validate_vector(vec, expected_dimension=4)
        assert out == [0.1, -0.2, 0.5, 1.0]

    def test_empty_vector_raises(self) -> None:
        with pytest.raises(EmbeddingProviderError, match="cannot be empty"):
            validate_vector([], expected_dimension=4)

    def test_dimension_mismatch_raises(self) -> None:
        with pytest.raises(EmbeddingDimensionMismatchError, match="Expected embedding dimension 3"):
            validate_vector([0.1, 0.2], expected_dimension=3)

    def test_nan_or_inf_raises(self) -> None:
        with pytest.raises(EmbeddingProviderError, match="invalid float"):
            validate_vector([0.1, float("nan")], expected_dimension=2)

        with pytest.raises(EmbeddingProviderError, match="invalid float"):
            validate_vector([float("inf"), 0.2], expected_dimension=2)


class TestLocalEmbeddingProvider:
    def test_local_provider_dimensions_and_model(self) -> None:
        provider = LocalEmbeddingProvider(model_name="BAAI/bge-small-en-v1.5", expected_dimensions=384)
        assert provider.provider_name == "local"
        assert provider.model_name == "BAAI/bge-small-en-v1.5"
        assert provider.dimensions == 384

    def test_embed_query_success(self) -> None:
        provider = LocalEmbeddingProvider(model_name="BAAI/bge-small-en-v1.5", expected_dimensions=384)
        vector = provider.embed_query("What is cellular respiration?")
        assert len(vector) == 384
        assert all(isinstance(x, float) for x in vector)

    def test_embed_empty_query_raises(self) -> None:
        provider = LocalEmbeddingProvider()
        with pytest.raises(EmbeddingInputError, match="cannot be empty"):
            provider.embed_query("   ")

    def test_embed_documents_batch(self) -> None:
        provider = LocalEmbeddingProvider(model_name="BAAI/bge-small-en-v1.5", expected_dimensions=384)
        texts = [
            "Photosynthesis produces glucose and oxygen from carbon dioxide and water.",
            "Cellular respiration breaks down glucose to produce ATP in mitochondria.",
        ]
        vectors = provider.embed_documents(texts)
        assert len(vectors) == 2
        assert len(vectors[0]) == 384
        assert len(vectors[1]) == 384

    def test_embed_documents_empty_item_raises(self) -> None:
        provider = LocalEmbeddingProvider()
        with pytest.raises(EmbeddingInputError, match="cannot be empty"):
            provider.embed_documents(["Valid text", ""])


class TestGatewayEmbeddingProvider:
    def test_config_validation(self) -> None:
        with pytest.raises(EmbeddingConfigurationError):
            GatewayEmbeddingProvider(api_key="", base_url="http://mock", model_name="test", expected_dimensions=384)

        with pytest.raises(EmbeddingConfigurationError):
            GatewayEmbeddingProvider(api_key="key", base_url="", model_name="test", expected_dimensions=384)

    def test_embed_query_via_mock_gateway(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_vector = [0.1] * 384

        class MockResponse:
            status_code = 200
            text = "ok"

            def json(self) -> dict:
                return {
                    "data": [
                        {"index": 0, "embedding": fake_vector}
                    ]
                }

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, url, headers=None, json=None):
                return MockResponse()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = GatewayEmbeddingProvider(
            api_key="mock-key",
            base_url="https://api.mock.ai/v1",
            model_name="mock-embed",
            expected_dimensions=384,
        )

        res = provider.embed_query("Test doubt")
        assert len(res) == 384
        assert res[0] == 0.1

    def test_gateway_rate_limit_429(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class Mock429Response:
            status_code = 429
            text = "Too Many Requests"

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                return Mock429Response()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = GatewayEmbeddingProvider(
            api_key="mock-key",
            base_url="https://api.mock.ai/v1",
            model_name="mock-embed",
            expected_dimensions=384,
        )

        with pytest.raises(EmbeddingProviderError, match="rate limit exceeded"):
            provider.embed_query("Test doubt")


class TestProviderFactory:
    def test_factory_returns_local_by_default(self) -> None:
        provider = get_embedding_provider(provider_name="local")
        assert isinstance(provider, LocalEmbeddingProvider)
        assert provider.dimensions == 384

    def test_factory_gateway_requires_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core import config
        monkeypatch.setattr(config.settings, "kilo_api_key", "")
        with pytest.raises(EmbeddingConfigurationError, match="KILO_API_KEY is not configured"):
            get_embedding_provider(provider_name="gateway")

