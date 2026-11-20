"""Tests for Kilo AI Provider abstraction and error handling."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.ai.base import (
    AIAuthenticationError,
    AICompletionResult,
    AIModelNotFoundError,
    AIProviderError,
    AIQuotaExceededError,
    AIRateLimitError,
    AITimeoutError,
)
from app.ai.kilo_provider import KiloAIProvider


@pytest.fixture
def sample_kilo_response() -> dict:
    return {
        "id": "gen-test-123",
        "object": "chat.completion",
        "created": 1700000000,
        "model": "kilo-auto/free",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": '{"status": "ok", "summary": "test"}',
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 120,
            "completion_tokens": 45,
            "total_tokens": 165,
        },
    }


class TestKiloAIProvider:
    def test_missing_api_key_raises_auth_error(self) -> None:
        provider = KiloAIProvider(api_key="")
        with pytest.raises(AIAuthenticationError, match="Kilo API key is not configured"):
            provider.generate([{"role": "user", "content": "hi"}])

    def test_successful_generation_parses_response(self, sample_kilo_response: dict) -> None:
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = sample_kilo_response
        mock_client.post.return_value = mock_resp

        provider = KiloAIProvider(
            api_key="test-key",
            default_model="kilo-auto/free",
            client=mock_client,
        )

        result = provider.generate([{"role": "user", "content": "Hello"}])

        assert isinstance(result, AICompletionResult)
        assert result.content == '{"status": "ok", "summary": "test"}'
        assert result.model == "kilo-auto/free"
        assert result.input_tokens == 120
        assert result.output_tokens == 45
        assert result.total_tokens == 165
        assert result.finish_reason == "stop"

    def test_401_authentication_failure_no_retry(self) -> None:
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"
        mock_client.post.return_value = mock_resp

        provider = KiloAIProvider(
            api_key="bad-key",
            client=mock_client,
            max_retries=3,
        )

        with pytest.raises(AIAuthenticationError, match="authentication failed: HTTP 401"):
            provider.generate([{"role": "user", "content": "Hello"}])

        # Permanent error -> only 1 call, no retries
        assert mock_client.post.call_count == 1

    def test_402_quota_exceeded_no_retry(self) -> None:
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 402
        mock_resp.text = "Credits Required"
        mock_client.post.return_value = mock_resp

        provider = KiloAIProvider(
            api_key="valid-key",
            client=mock_client,
            max_retries=3,
        )

        with pytest.raises(AIQuotaExceededError, match="credits exhausted"):
            provider.generate([{"role": "user", "content": "Hello"}])

        assert mock_client.post.call_count == 1

    def test_404_model_not_found_no_retry(self) -> None:
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "Not Found"
        mock_client.post.return_value = mock_resp

        provider = KiloAIProvider(
            api_key="valid-key",
            default_model="unknown-model",
            client=mock_client,
            max_retries=3,
        )

        with pytest.raises(AIModelNotFoundError, match="Model 'unknown-model' not found"):
            provider.generate([{"role": "user", "content": "Hello"}])

        assert mock_client.post.call_count == 1

    @patch("time.sleep", return_value=None)
    def test_429_rate_limit_retries_and_raises(self, mock_sleep: MagicMock) -> None:
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.text = "Too Many Requests"
        mock_client.post.return_value = mock_resp

        provider = KiloAIProvider(
            api_key="valid-key",
            client=mock_client,
            max_retries=2,
        )

        with pytest.raises(AIRateLimitError, match="rate limit exceeded"):
            provider.generate([{"role": "user", "content": "Hello"}])

        assert mock_client.post.call_count == 2
        assert mock_sleep.call_count == 1

    @patch("time.sleep", return_value=None)
    def test_500_server_error_retries_and_raises(self, mock_sleep: MagicMock) -> None:
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        mock_client.post.return_value = mock_resp

        provider = KiloAIProvider(
            api_key="valid-key",
            client=mock_client,
            max_retries=2,
        )

        with pytest.raises(AIProviderError, match="5xx server error"):
            provider.generate([{"role": "user", "content": "Hello"}])

        assert mock_client.post.call_count == 2

    @patch("time.sleep", return_value=None)
    def test_timeout_retries_and_raises(self, mock_sleep: MagicMock) -> None:
        mock_client = MagicMock()
        mock_client.post.side_effect = httpx.TimeoutException("Timeout")

        provider = KiloAIProvider(
            api_key="valid-key",
            client=mock_client,
            max_retries=2,
        )

        with pytest.raises(AITimeoutError, match="request timed out"):
            provider.generate([{"role": "user", "content": "Hello"}])

        assert mock_client.post.call_count == 2

    @patch("time.sleep", return_value=None)
    def test_transient_failure_succeeds_on_second_attempt(
        self, mock_sleep: MagicMock, sample_kilo_response: dict
    ) -> None:
        mock_client = MagicMock()
        err_resp = MagicMock()
        err_resp.status_code = 503
        err_resp.text = "Unavailable"

        ok_resp = MagicMock()
        ok_resp.status_code = 200
        ok_resp.json.return_value = sample_kilo_response

        mock_client.post.side_effect = [err_resp, ok_resp]

        provider = KiloAIProvider(
            api_key="valid-key",
            client=mock_client,
            max_retries=3,
        )

        result = provider.generate([{"role": "user", "content": "Hello"}])
        assert result.content == '{"status": "ok", "summary": "test"}'
        assert mock_client.post.call_count == 2

