"""Authentication schemas."""

from pydantic import BaseModel, Field


class AuthenticatedUser(BaseModel):
    """Verified identity extracted from a Clerk session token.

    Only claims that passed cryptographic verification are included.
    Unverified profile fields (email, name, metadata) are deliberately
    not trusted as identity.
    """

    user_id: str = Field(description="Verified `sub` claim (Clerk user id)")
    session_id: str | None = Field(
        default=None, description="Verified `sid` claim when present"
    )
    issuer: str | None = Field(
        default=None, description="Verified `iss` claim"
    )
    authorized_party: str | None = Field(
        default=None, description="Verified `azp` claim when present"
    )
    token_issued_at: int | None = Field(
        default=None, description="Verified `iat` claim (epoch seconds)"
    )
    token_expires_at: int | None = Field(
        default=None, description="Verified `exp` claim (epoch seconds)"
    )


class MeResponse(BaseModel):
    """Response body for GET /api/v1/auth/me."""

    user_id: str
    authenticated: bool = True
