"""Unit tests for embedding providers and factory (Phase 10 / Low-Memory Hosting)."""

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
from app.ai.embeddings.jina_provider import (
    DEFAULT_JINA_DIMENSIONS,
    DEFAULT_JINA_MODEL,
    JinaEmbeddingProvider,
)
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


class TestJinaEmbeddingProvider:
    def test_config_validation(self) -> None:
        with pytest.raises(EmbeddingConfigurationError, match="requires a valid API key"):
            JinaEmbeddingProvider(api_key="")

        with pytest.raises(EmbeddingConfigurationError, match="requires a valid API key"):
            JinaEmbeddingProvider(api_key="   ")

        with pytest.raises(EmbeddingConfigurationError, match="requires a valid base_url"):
            JinaEmbeddingProvider(api_key="key", base_url="")

        with pytest.raises(EmbeddingConfigurationError, match="requires a valid model_name"):
            JinaEmbeddingProvider(api_key="key", model_name="")

    def test_properties(self) -> None:
        provider = JinaEmbeddingProvider(
            api_key="test-key",
            model_name="jina-embeddings-v3",
            dimensions=1024,
        )
        assert provider.provider_name == "jina"
        assert provider.model_name == "jina-embeddings-v3"
        assert provider.dimensions == 1024

    def test_embed_query_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        captured_payload: dict = {}
        fake_vector = [0.05] * 1024

        class MockResponse:
            status_code = 200
            text = "ok"

            def json(self) -> dict:
                return {
                    "model": "jina-embeddings-v3",
                    "data": [{"index": 0, "embedding": fake_vector}],
                }

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, url, headers=None, json=None):
                captured_payload.update(json or {})
                assert headers["Authorization"] == "Bearer test-jina-key"
                return MockResponse()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(
            api_key="test-jina-key",
            model_name="jina-embeddings-v3",
            dimensions=1024,
        )

        res = provider.embed_query("What is the powerhouse of the cell?")
        assert len(res) == 1024
        assert res[0] == 0.05
        assert captured_payload["task"] == "retrieval.query"
        assert captured_payload["model"] == "jina-embeddings-v3"
        assert captured_payload["dimensions"] == 1024
        assert captured_payload["input"] == ["What is the powerhouse of the cell?"]

    def test_embed_empty_query_raises(self) -> None:
        provider = JinaEmbeddingProvider(api_key="test-key")
        with pytest.raises(EmbeddingInputError, match="cannot be empty"):
            provider.embed_query("   ")

    def test_embed_documents_batch(self, monkeypatch: pytest.MonkeyPatch) -> None:
        post_calls: list[dict] = []
        fake_vector = [0.01] * 1024

        class MockResponse:
            status_code = 200
            text = "ok"

            def __init__(self, count: int):
                self._count = count

            def json(self) -> dict:
                return {
                    "data": [{"index": i, "embedding": fake_vector} for i in range(self._count)]
                }

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, url, headers=None, json=None):
                post_calls.append(json)
                return MockResponse(len(json["input"]))

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(
            api_key="test-key",
            batch_size=2,
            dimensions=1024,
        )

        texts = ["Passage 1", "Passage 2", "Passage 3"]
        vectors = provider.embed_documents(texts)

        assert len(vectors) == 3
        assert len(vectors[0]) == 1024
        assert len(post_calls) == 2  # 3 items with batch_size=2 -> 2 calls
        assert post_calls[0]["task"] == "retrieval.passage"
        assert post_calls[0]["input"] == ["Passage 1", "Passage 2"]
        assert post_calls[1]["input"] == ["Passage 3"]

    def test_embed_documents_empty_list(self) -> None:
        provider = JinaEmbeddingProvider(api_key="test-key")
        assert provider.embed_documents([]) == []

    def test_embed_documents_empty_item_raises(self) -> None:
        provider = JinaEmbeddingProvider(api_key="test-key")
        with pytest.raises(EmbeddingInputError, match="cannot be empty"):
            provider.embed_documents(["Valid text", "  "])

    def test_jina_preserves_order_via_index(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # API returns results in reverse order
        v0 = [0.1] * 1024
        v1 = [0.9] * 1024

        class MockResponse:
            status_code = 200
            text = "ok"

            def json(self) -> dict:
                return {
                    "data": [
                        {"index": 1, "embedding": v1},
                        {"index": 0, "embedding": v0},
                    ]
                }

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                return MockResponse()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(api_key="test-key", dimensions=1024)
        vectors = provider.embed_documents(["First", "Second"])
        assert vectors[0] == v0
        assert vectors[1] == v1

    def test_jina_auth_failure_401(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class Mock401Response:
            status_code = 401
            text = "Unauthorized: Invalid API key"

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                return Mock401Response()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(api_key="bad-key")
        with pytest.raises(EmbeddingConfigurationError, match="authentication failed"):
            provider.embed_query("Test")

    def test_jina_auth_failure_403(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class Mock403Response:
            status_code = 403
            text = "Forbidden"

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                return Mock403Response()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(api_key="forbidden-key")
        with pytest.raises(EmbeddingConfigurationError, match="authentication failed"):
            provider.embed_query("Test")

    def test_jina_rate_limit_429_retry_and_exhaustion(self, monkeypatch: pytest.MonkeyPatch) -> None:
        attempts = 0

        class Mock429Response:
            status_code = 429
            text = "Rate limit exceeded"
            headers = {"Retry-After": "0"}

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                nonlocal attempts
                attempts += 1
                return Mock429Response()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(
            api_key="test-key",
            max_retries=3,
            retry_backoff_factor=0.01,
        )

        with pytest.raises(EmbeddingProviderError, match="rate limit exceeded"):
            provider.embed_query("Test")
        assert attempts == 3

    def test_jina_server_error_500_retry_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        attempts = 0
        fake_vector = [0.2] * 1024

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                nonlocal attempts
                attempts += 1
                if attempts == 1:
                    class Mock500Response:
                        status_code = 500
                        text = "Internal Server Error"
                    return Mock500Response()

                class Mock200Response:
                    status_code = 200
                    text = "ok"
                    def json(self) -> dict:
                        return {"data": [{"index": 0, "embedding": fake_vector}]}
                return Mock200Response()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(
            api_key="test-key",
            max_retries=3,
            retry_backoff_factor=0.01,
            dimensions=1024,
        )

        vec = provider.embed_query("Test")
        assert len(vec) == 1024
        assert attempts == 2

    def test_jina_dimension_mismatch_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class MockResponse:
            status_code = 200
            text = "ok"

            def json(self) -> dict:
                return {
                    "data": [{"index": 0, "embedding": [0.1, 0.2]}]  # only 2 dims instead of 1024
                }

        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                return MockResponse()

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(api_key="test-key", dimensions=1024)
        with pytest.raises(EmbeddingDimensionMismatchError, match="Expected embedding dimension 1024"):
            provider.embed_query("Test")

    def test_jina_timeout_handling(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class MockClient:
            def __init__(self, *args, **kwargs):
                pass
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def post(self, *args, **kwargs):
                raise httpx.TimeoutException("Read timed out")

        monkeypatch.setattr(httpx, "Client", MockClient)

        provider = JinaEmbeddingProvider(
            api_key="test-key",
            max_retries=2,
            retry_backoff_factor=0.01,
        )

        with pytest.raises(EmbeddingProviderError, match="timed out"):
            provider.embed_query("Test")


class TestLocalEmbeddingProvider:
    def test_local_provider_dimensions_and_model(self) -> None:
        provider = LocalEmbeddingProvider(model_name="BAAI/bge-small-en-v1.5", expected_dimensions=384)
        assert provider.provider_name == "local"
        assert provider.model_name == "BAAI/bge-small-en-v1.5"
        assert provider.dimensions == 384

    def test_embed_empty_query_raises(self) -> None:
        provider = LocalEmbeddingProvider()
        with pytest.raises(EmbeddingInputError, match="cannot be empty"):
            provider.embed_query("   ")

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


class TestProviderFactory:
    def test_factory_returns_jina_by_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core import config
        monkeypatch.setattr(config.settings, "embedding_provider", "jina")
        monkeypatch.setattr(config.settings, "jina_api_key", "valid-jina-key")
        provider = get_embedding_provider()
        assert isinstance(provider, JinaEmbeddingProvider)
        assert provider.dimensions == 1024
        assert provider.model_name == "jina-embeddings-v3"

    def test_factory_jina_requires_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core import config
        monkeypatch.setattr(config.settings, "embedding_provider", "jina")
        monkeypatch.setattr(config.settings, "jina_api_key", "")
        with pytest.raises(EmbeddingConfigurationError, match="JINA_API_KEY is not configured"):
            get_embedding_provider(provider_name="jina")

    def test_factory_returns_local_when_requested(self) -> None:
        provider = get_embedding_provider(provider_name="local")
        assert isinstance(provider, LocalEmbeddingProvider)
        assert provider.dimensions == 384

    def test_factory_gateway_requires_api_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.core import config
        monkeypatch.setattr(config.settings, "kilo_api_key", "")
        with pytest.raises(EmbeddingConfigurationError, match="KILO_API_KEY is not configured"):
            get_embedding_provider(provider_name="gateway")

    def test_factory_unknown_provider_raises(self) -> None:
        with pytest.raises(EmbeddingConfigurationError, match="Unknown embedding provider"):
            get_embedding_provider(provider_name="unsupported_provider")
