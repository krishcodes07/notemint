"""Clerk session JWT verification.

Verifies Clerk-issued session tokens against the instance's published JWKS
using PyJWT with RS256 cryptographic signature checks. JWKS responses are
cached (with automatic refresh on unknown `kid` for key rotation) — the
endpoint is never fetched on every request.
"""

import logging

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_ALGORITHMS = ["RS256"]
JWKS_CACHE_LIFESPAN_SECONDS = 300


class AuthenticationError(Exception):
    """Token could not be authenticated.

    The exception message is logged server-side only — API responses must
    never echo verification internals back to the client.
    """


_jwks_client: PyJWKClient | None = None


def get_jwks_client() -> PyJWKClient:
    """Return the process-wide JWKS client (cached; fetches JWKS lazily)."""
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            settings.clerk_jwks_url,
            cache_jwk_set=True,
            lifespan=JWKS_CACHE_LIFESPAN_SECONDS,
            timeout=10,
        )
    return _jwks_client


def reset_jwks_client() -> None:
    """Drop the cached JWKS client (tests / configuration changes)."""
    global _jwks_client
    _jwks_client = None


def verify_clerk_token(token: str) -> dict:
    """Verify a Clerk session JWT and return its claims.

    Validates: signature (RS256 via JWKS), algorithm, expiration (`exp`),
    not-before (`nbf`) when present, issuer (`iss`), authorized party
    (`azp`) when configured, and audience (`aud`) when configured.

    Raises:
        AuthenticationError: the token is missing claims, expired, wrongly
            signed, or otherwise not acceptable.
    """
    if not settings.clerk_jwks_url or not settings.clerk_issuer:
        logger.error(
            "Clerk verification is not configured — set CLERK_JWKS_URL and CLERK_ISSUER"
        )
        raise AuthenticationError("Authentication is not configured")

    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(token)
    except PyJWTError:
        # Malformed token (cannot even read the header/kid).
        raise AuthenticationError("Invalid token") from None
    except Exception as exc:  # noqa: BLE001 — JWKS fetch/parse/lookup failures
        logger.warning("JWKS resolution failed: %s", type(exc).__name__)
        raise AuthenticationError("Invalid token") from exc

    verify_aud = bool(settings.clerk_audience.strip())
    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALLOWED_ALGORITHMS,
            issuer=settings.clerk_issuer,
            audience=settings.clerk_audience if verify_aud else None,
            leeway=60,
            options={
                "require": ["exp", "iss", "sub"],
                "verify_aud": verify_aud,
            },
        )
    except PyJWTError as exc:
        logger.info("Token rejected: %s", type(exc).__name__)
        raise AuthenticationError("Invalid token") from exc

    authorized_parties = settings.authorized_parties
    if authorized_parties:
        azp = claims.get("azp")
        if azp not in authorized_parties:
            logger.info("Token rejected: azp %r not in authorized parties", azp)
            raise AuthenticationError("Invalid token")

    return claims
