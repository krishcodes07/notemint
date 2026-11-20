"""Kilo Gateway AI provider integration using OpenAI-compatible chat completions."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Iterator

import httpx

from app.ai.base import (
    AIAuthenticationError,
    AICompletionResult,
    AIModelNotFoundError,
    AIProviderError,
    AIQuotaExceededError,
    AIRateLimitError,
    AITimeoutError,
    BaseAIProvider,
)

logger = logging.getLogger(__name__)


class KiloAIProvider(BaseAIProvider):
    """Production provider integrating NoteMint with Kilo Gateway."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.kilo.ai/api/gateway",
        default_model: str = "kilo-auto/free",
        default_timeout_seconds: float = 120.0,
        default_max_tokens: int = 4096,
        default_temperature: float = 0.3,
        max_retries: int = 3,
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.default_timeout_seconds = default_timeout_seconds
        self.default_max_tokens = default_max_tokens
        self.default_temperature = default_temperature
        self.max_retries = max_retries
        self._client = client

    def _get_client(self, timeout: float) -> httpx.Client:
        if self._client is not None:
            return self._client
        return httpx.Client(
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "NoteMint-API/1.0",
            },
        )

    def generate(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> AICompletionResult:
        """Call Kilo Gateway chat completions endpoint with bounded retries."""
        if not self.api_key:
            raise AIAuthenticationError(
                "Kilo API key is not configured. Set KILO_API_KEY in environment or .env.",
                status_code=401,
            )

        target_model = model or self.default_model
        req_timeout = timeout or self.default_timeout_seconds
        req_max_tokens = max_tokens or self.default_max_tokens
        req_temperature = (
            temperature if temperature is not None else self.default_temperature
        )

        payload: dict[str, Any] = {
            "model": target_model,
            "messages": messages,
            "max_tokens": req_max_tokens,
            "temperature": req_temperature,
        }
        if response_format is not None:
            payload["response_format"] = response_format

        endpoint_url = f"{self.base_url}/chat/completions"
        attempt = 0
        backoff_delay = 1.0

        client = self._get_client(req_timeout)
        should_close = self._client is None

        try:
            while True:
                attempt += 1
                try:
                    logger.info(
                        "Dispatching AI generation request to Kilo Gateway (model=%s, attempt=%d/%d)",
                        target_model,
                        attempt,
                        self.max_retries,
                    )
                    start_time = time.monotonic()
                    response = client.post(
                        endpoint_url,
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                            "User-Agent": "NoteMint-API/1.0",
                        },
                    )
                    duration = time.monotonic() - start_time
                    logger.info(
                        "Kilo Gateway returned HTTP %d in %.2fs (model=%s)",
                        response.status_code,
                        duration,
                        target_model,
                    )

                    # Successful response
                    if response.status_code == 200:
                        return self._parse_success_response(
                            response.json(), target_model
                        )

                    # Permanent client/auth errors (do not retry)
                    if response.status_code in (401, 403):
                        raise AIAuthenticationError(
                            f"Kilo Gateway authentication failed: HTTP {response.status_code}. "
                            "Please verify KILO_API_KEY.",
                            status_code=response.status_code,
                        )

                    if response.status_code == 402:
                        raise AIQuotaExceededError(
                            "Kilo Gateway credits exhausted or selected model is paid. "
                            "Switch to a free model (e.g. 'kilo-auto/free') or add credits.",
                            status_code=402,
                        )

                    if response.status_code == 404:
                        raise AIModelNotFoundError(
                            f"Model '{target_model}' not found on Kilo Gateway. HTTP 404.",
                            status_code=404,
                        )

                    # Transient rate limits or server errors (retry with backoff)
                    if response.status_code == 429:
                        if attempt >= self.max_retries:
                            raise AIRateLimitError(
                                "Kilo Gateway rate limit exceeded after maximum retries. Please wait and try again.",
                                status_code=429,
                            )
                        logger.warning(
                            "Kilo Gateway 429 rate limit hit; backing off %.1fs before attempt %d",
                            backoff_delay,
                            attempt + 1,
                        )
                        time.sleep(backoff_delay)
                        backoff_delay *= 2
                        continue

                    if response.status_code >= 500:
                        if attempt >= self.max_retries:
                            raise AIProviderError(
                                f"Kilo Gateway 5xx server error (HTTP {response.status_code}) after {attempt} attempts: {response.text[:200]}",
                                status_code=response.status_code,
                            )
                        logger.warning(
                            "Kilo Gateway %d error; backing off %.1fs before retry %d",
                            response.status_code,
                            backoff_delay,
                            attempt + 1,
                        )
                        time.sleep(backoff_delay)
                        backoff_delay *= 2
                        continue

                    # Other 4xx client errors
                    raise AIProviderError(
                        f"Kilo Gateway request failed with status {response.status_code}: {response.text[:200]}",
                        status_code=response.status_code,
                    )

                except httpx.TimeoutException as exc:
                    if attempt >= self.max_retries:
                        raise AITimeoutError(
                            f"Kilo Gateway request timed out after {req_timeout}s across {attempt} attempts."
                        ) from exc
                    logger.warning(
                        "Kilo Gateway request timed out; backing off %.1fs before retry",
                        backoff_delay,
                    )
                    time.sleep(backoff_delay)
                    backoff_delay *= 2

                except httpx.NetworkError as exc:
                    if attempt >= self.max_retries:
                        raise AIProviderError(
                            f"Kilo Gateway network failure across {attempt} attempts: {exc}"
                        ) from exc
                    logger.warning(
                        "Kilo Gateway network error; backing off %.1fs before retry: %s",
                        backoff_delay,
                        exc,
                    )
                    time.sleep(backoff_delay)
                    backoff_delay *= 2

        finally:
            if should_close:
                client.close()

    def _parse_success_response(
        self, data: dict[str, Any], requested_model: str
    ) -> AICompletionResult:
        """Parse standard OpenAI-compatible chat completion payload."""
        choices = data.get("choices")
        if not choices or not isinstance(choices, list):
            raise AIProviderError(
                "Kilo Gateway returned response with missing or empty choices list."
            )

        first_choice = choices[0]
        message = first_choice.get("message", {})
        content = message.get("content")

        # Fallback if content is None but reasoning or text exists
        if content is None:
            content = message.get("text") or message.get("reasoning") or ""

        finish_reason = first_choice.get("finish_reason")
        resolved_model = data.get("model") or requested_model

        usage = data.get("usage", {})
        input_tokens = usage.get("prompt_tokens")
        output_tokens = usage.get("completion_tokens")
        total_tokens = usage.get("total_tokens")

        return AICompletionResult(
            content=str(content),
            model=str(resolved_model),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            finish_reason=finish_reason,
            raw_response=data,
        )

    def generate_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        timeout: float | None = None,
    ) -> Iterator[str]:
        """Execute a streaming chat completion, yielding text delta chunks."""
        if not self.api_key:
            raise AIAuthenticationError(
                "Kilo API key is not configured. Set KILO_API_KEY in environment or .env.",
                status_code=401,
            )

        target_model = model or self.default_model
        req_timeout = timeout or self.default_timeout_seconds
        req_max_tokens = max_tokens or self.default_max_tokens
        req_temperature = (
            temperature if temperature is not None else self.default_temperature
        )

        payload: dict[str, Any] = {
            "model": target_model,
            "messages": messages,
            "max_tokens": req_max_tokens,
            "temperature": req_temperature,
            "stream": True,
        }

        endpoint_url = f"{self.base_url}/chat/completions"
        client = self._get_client(req_timeout)
        should_close = self._client is None

        try:
            with client.stream(
                "POST",
                endpoint_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "NoteMint-API/1.0",
                },
            ) as response:
                if response.status_code in (401, 403):
                    raise AIAuthenticationError(
                        f"Kilo Gateway authentication failed: HTTP {response.status_code}.",
                        status_code=response.status_code,
                    )
                if response.status_code == 402:
                    raise AIQuotaExceededError(
                        "Kilo Gateway credits exhausted.",
                        status_code=402,
                    )
                if response.status_code == 404:
                    raise AIModelNotFoundError(
                        f"Model '{target_model}' not found on Kilo Gateway. HTTP 404.",
                        status_code=404,
                    )
                if response.status_code == 429:
                    raise AIRateLimitError(
                        "Kilo Gateway rate limit exceeded.",
                        status_code=429,
                    )
                if response.status_code >= 400:
                    raise AIProviderError(
                        f"Kilo Gateway request failed with status {response.status_code}",
                        status_code=response.status_code,
                    )

                for line in response.iter_lines():
                    trimmed = line.strip()
                    if not trimmed:
                        continue
                    if trimmed.startswith("data: "):
                        data_str = trimmed[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                text = delta.get("content") or ""
                                if text:
                                    yield text
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except httpx.TimeoutException as exc:
            raise AITimeoutError(
                f"Kilo Gateway streaming timed out after {req_timeout}s."
            ) from exc
        except httpx.NetworkError as exc:
            raise AIProviderError(
                f"Kilo Gateway network error during streaming: {exc}"
            ) from exc
        finally:
            if should_close:
                client.close()

