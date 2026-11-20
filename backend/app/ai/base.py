"""Base AI provider interfaces, results, and exceptions."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


class AIProviderError(Exception):
    """Base exception for all AI provider interactions."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        provider: str = "kilo",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.provider = provider


class AIAuthenticationError(AIProviderError):
    """Invalid, missing, or unauthorized API key."""


class AIRateLimitError(AIProviderError):
    """Rate limit exceeded on provider gateway."""


class AIModelNotFoundError(AIProviderError):
    """Requested model identifier is not available on provider."""


class AITimeoutError(AIProviderError):
    """Provider request timed out."""


class AIQuotaExceededError(AIProviderError):
    """Provider quota or credits exhausted."""


class AIValidationError(AIProviderError):
    """Generated model response failed schema validation or repair."""


@dataclass(frozen=True)
class AICompletionResult:
    """Standardized result from an AI provider completion."""

    content: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    finish_reason: str | None = None
    raw_response: dict[str, Any] | None = None


class BaseAIProvider(ABC):
    """Abstract interface for AI LLM providers."""

    @abstractmethod
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
        """Execute a chat completion request.

        Args:
            messages: List of role-content message dictionaries.
            model: Model name/identifier (falls back to provider default).
            temperature: Sampling temperature (0.0 to 1.0).
            max_tokens: Maximum completion output tokens.
            response_format: Optional structured output format e.g. {"type": "json_object"}.
            timeout: Request timeout in seconds.

        Returns:
            Standardized AICompletionResult.

        Raises:
            AIAuthenticationError, AIRateLimitError, AIModelNotFoundError,
            AITimeoutError, AIQuotaExceededError, AIProviderError.
        """
        raise NotImplementedError

