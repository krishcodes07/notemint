"""Authentication dependencies."""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import AuthenticationError, verify_clerk_token
from app.schemas.auth import AuthenticatedUser

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """Resolve the authenticated user from a Bearer session token.

    Reads the Authorization header, verifies the Clerk JWT independently
    (signature, exp/nbf, iss, azp, aud), and returns the typed identity.

    Raises:
        HTTPException 401: missing credentials or invalid/expired token.
            Verification internals are never included in the response.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        claims = verify_clerk_token(credentials.credentials)
    except AuthenticationError:
        raise HTTPException(
            status_code=401, detail="Invalid or expired token"
        ) from None

    return AuthenticatedUser(
        user_id=claims["sub"],
        session_id=claims.get("sid"),
        issuer=claims.get("iss"),
        authorized_party=claims.get("azp"),
        token_issued_at=claims.get("iat"),
        token_expires_at=claims.get("exp"),
    )
