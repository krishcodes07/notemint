"""User profile schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class UserProfileResponse(BaseModel):
    """Application profile for GET /api/v1/users/me."""

    clerk_user_id: str = Field(description="Verified Clerk user id")
    display_name: str | None = Field(
        default=None, description="Display name when known"
    )
    email: str | None = Field(
        default=None, description="Email only when from a trusted source"
    )
    created_at: datetime = Field(description="First authenticated interaction")

    model_config = {"from_attributes": True}
