"""Health-check endpoints.

The basic ``/health`` endpoint stays public (frontend connectivity card).
Infrastructure checks (``/health/database``, ``/health/storage``) are also
public so external uptime monitors can probe them unauthenticated — they
return only a generic ``status``/``service`` pair and never expose
connection strings, credentials, or exception details. Details are logged
server-side only.
"""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import settings
from app.db.session import (
    DatabaseNotConfiguredError,
    DatabaseUnavailableError,
    check_database_connection,
)
from app.services.storage_service import (
    StorageNotConfiguredError,
    StorageService,
    StorageUnavailableError,
    get_storage_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Response body for GET /api/v1/health."""

    status: str
    service: str


def _status_response(service: str, ok: bool) -> JSONResponse:
    """Generic, detail-free payload — never leaks credentials or internals."""
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "unavailable", "service": service},
    )


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="API health check",
)
def health_check() -> HealthResponse:
    """Return service liveness information (public, unauthenticated)."""
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


@router.get(
    "/health/database",
    summary="Database connectivity check",
)
def health_database() -> JSONResponse:
    """Verify database connectivity with a lightweight ``SELECT 1``.

    Returns 200 when reachable, 503 otherwise. The payload is generic: no
    connection strings, passwords, or exception details are ever returned.
    """
    try:
        check_database_connection()
    except DatabaseNotConfiguredError:
        logger.warning("Database health check: DATABASE_URL not configured")
        return _status_response("database", ok=False)
    except DatabaseUnavailableError:
        return _status_response("database", ok=False)
    return _status_response("database", ok=True)


@router.get(
    "/health/storage",
    summary="Object Storage connectivity check",
)
def health_storage(
    service: StorageService = Depends(get_storage_service),
) -> JSONResponse:
    """Verify Object Storage credentials and bucket access (no file changes).

    Returns 200 when the private bucket is reachable, 503 otherwise. The
    payload is generic — no credentials or boto error messages are exposed.
    """
    try:
        service.health_check()
    except StorageNotConfiguredError:
        logger.warning("Storage health check: storage not configured")
        return _status_response("storage", ok=False)
    except StorageUnavailableError:
        return _status_response("storage", ok=False)
    return _status_response("storage", ok=True)
