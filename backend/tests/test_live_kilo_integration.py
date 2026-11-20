"""Explicit live integration test against Kilo Gateway using configured credentials.

Skipped by default unless RUN_LIVE_KILO_TEST=true is set in environment.
"""

from __future__ import annotations

import os

import pytest

from app.ai.base import AICompletionResult
from app.ai.kilo_provider import KiloAIProvider
from app.core.config import get_settings


@pytest.mark.skipif(
    os.getenv("RUN_LIVE_KILO_TEST", "").lower() != "true",
    reason="Live Kilo integration test skipped unless RUN_LIVE_KILO_TEST=true",
)
class TestLiveKiloIntegration:
    def test_live_chat_completion_kilo_gateway(self) -> None:
        settings = get_settings()
        assert settings.kilo_api_key, "KILO_API_KEY must be set to run live test"

        provider = KiloAIProvider(
            api_key=settings.kilo_api_key,
            base_url=settings.kilo_base_url,
            default_model=settings.kilo_model,
        )

        messages = [
            {
                "role": "system",
                "content": "You are a study assistant. Respond ONLY with valid JSON: {\"status\": \"ok\", \"ping\": \"pong\"}",
            },
            {
                "role": "user",
                "content": "Generate a test ping response in JSON format.",
            },
        ]

        result = provider.generate(
            messages=messages,
            response_format={"type": "json_object"},
            max_tokens=500,
        )

        assert isinstance(result, AICompletionResult)
        assert result.content
        assert result.input_tokens is not None
        assert "pong" in result.content.lower() or "ok" in result.content.lower()

