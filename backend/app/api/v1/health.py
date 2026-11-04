"""Health-check endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Response body for GET /api/v1/health."""

    status: str
    service: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="API health check",
)
def health_check() -> HealthResponse:
    """Return service liveness information."""
    return HealthResponse(status="healthy", service="notemint-api")


@router.get(
    "/health/info",
    response_model=dict[str, str],
    summary="API environment info",
)
def health_info() -> dict[str, str]:
    """Return non-sensitive environment details (useful during development)."""
    return {
        "service": settings.app_name,
        "environment": settings.app_env,
        "api_prefix": settings.api_v1_prefix,
    }
