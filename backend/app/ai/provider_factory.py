"""AI provider factory module."""

from __future__ import annotations

from fastapi import Depends

from app.ai.base import BaseAIProvider
from app.ai.kilo_provider import KiloAIProvider
from app.core.config import Settings, get_settings


def get_ai_provider(settings: Settings | None = Depends(get_settings)) -> BaseAIProvider:
    """Create and return configured AI provider (Kilo Gateway)."""
    cfg = settings if isinstance(settings, Settings) else get_settings()
    return KiloAIProvider(
        api_key=cfg.kilo_api_key,
        base_url=cfg.kilo_base_url,
        default_model=cfg.kilo_model,
        default_timeout_seconds=float(cfg.ai_request_timeout_seconds),
        default_max_tokens=cfg.ai_max_output_tokens,
        default_temperature=cfg.ai_temperature,
        max_retries=cfg.ai_max_retries,
    )
