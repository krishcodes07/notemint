"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import auth, documents, health, users
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(documents.router)

__all__ = ["api_router", "settings"]
