"""Authentication tests — mocked JWKS, no real Clerk credentials required.

Covers:
- verify_clerk_token unit scenarios (valid, expired, bad issuer/signature/azp/aud, nbf)
- JWKS resolution + caching + key rotation
- GET /api/v1/auth/me endpoint (missing/invalid/valid tokens)
- Public health endpoint remains accessible
"""

from __future__ import annotations

import io
import json
import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt import PyJWKClient
from jwt.algorithms import RSAAlgorithm

from app.core import security
from app.core.config import settings
from app.main import app

ISSUER = "https://clerk.example.dev"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"
AUTHORIZED_PARTIES = "http://localhost:3000"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def rsa_keys() -> tuple[Any, Any]:
    """Generate a module-scoped RSA keypair (private, public)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


@pytest.fixture(scope="module")
def other_private_key() -> Any:
    """A different RSA key used to produce invalid-signature tokens."""
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def make_jwks(public_key: Any, kid: str = "test-key") -> dict[str, Any]:
    jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    jwk.update({"kid": kid, "use": "sig", "alg": "RS256"})
    return {"keys": [jwk]}


@pytest.fixture
def clerk_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Point settings at a fake Clerk instance and reset the JWKS client."""
    monkeypatch.setattr(settings, "clerk_jwks_url", JWKS_URL)
    monkeypatch.setattr(settings, "clerk_issuer", ISSUER)
    monkeypatch.setattr(settings, "clerk_authorized_parties", AUTHORIZED_PARTIES)
    monkeypatch.setattr(settings, "clerk_audience", "")
    security.reset_jwks_client()
    yield
    security.reset_jwks_client()


@pytest.fixture
def mock_jwks(
    monkeypatch: pytest.MonkeyPatch,
    rsa_keys: tuple[Any, Any],
    clerk_env: None,
) -> dict[str, Any]:
    """Serve a static JWKS (single key) instead of hitting the network."""
    _, public_key = rsa_keys
    jwks = make_jwks(public_key)
    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)
    return jwks


def make_token(
    private_key: Any,
    *,
    overrides: dict[str, Any] | None = None,
    headers: dict[str, Any] | None = None,
    kid: str = "test-key",
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": "user_abc123",
        "iss": ISSUER,
        "iat": now - 60,
        "nbf": now - 60,
        "exp": now + 300,
        "azp": AUTHORIZED_PARTIES,
        "sid": "sess_xyz789",
    }
    if overrides is not None:
        claims.update(overrides)
    return jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": kid, **(headers or {})},
    )


# ---------------------------------------------------------------------------
# verify_clerk_token — unit scenarios
# ---------------------------------------------------------------------------


class TestVerifyClerkToken:
    def test_valid_token_returns_claims(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key)

        claims = security.verify_clerk_token(token)

        assert claims["sub"] == "user_abc123"
        assert claims["iss"] == ISSUER
        assert claims["sid"] == "sess_xyz789"

    def test_expired_token_rejected(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        now = int(time.time())
        token = make_token(
            private_key, overrides={"exp": now - 120, "iat": now - 600, "nbf": now - 600}
        )

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_not_yet_valid_token_rejected(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        now = int(time.time())
        # nbf far in the future, beyond the 60s leeway
        token = make_token(private_key, overrides={"nbf": now + 600})

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_incorrect_issuer_rejected(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, overrides={"iss": "https://evil.example.com"})

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_invalid_signature_rejected(
        self,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        other_private_key: Any,
    ) -> None:
        # Signed with a key that is NOT in the JWKS
        token = make_token(other_private_key)

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_incorrect_algorithm_rejected(
        self,
        mock_jwks: dict[str, Any],
    ) -> None:
        now = int(time.time())
        claims = {
            "sub": "user_abc123",
            "iss": ISSUER,
            "iat": now - 60,
            "exp": now + 300,
            "azp": AUTHORIZED_PARTIES,
        }
        # HS256 token pointing at our RS256 kid — algorithm allowlist must reject it
        token = jwt.encode(
            claims, "symmetric-secret", algorithm="HS256", headers={"kid": "test-key"}
        )

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_missing_required_sub_rejected(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        now = int(time.time())
        token = jwt.encode(
            {"iss": ISSUER, "exp": now + 300, "iat": now},
            private_key,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_wrong_azp_rejected_when_configured(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, overrides={"azp": "https://evil.example.com"})

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_missing_azp_rejected_when_configured(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": "user_abc123",
                "iss": ISSUER,
                "iat": now - 60,
                "exp": now + 300,
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_azp_check_skipped_when_not_configured(
        self,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "clerk_authorized_parties", "")
        private_key, _ = rsa_keys
        token = make_token(private_key, overrides={"azp": "https://anywhere.example.com"})

        claims = security.verify_clerk_token(token)
        assert claims["sub"] == "user_abc123"

    def test_audience_validated_when_configured(
        self,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "clerk_audience", "https://api.notemint.app")
        private_key, _ = rsa_keys

        good = make_token(private_key, overrides={"aud": "https://api.notemint.app"})
        assert security.verify_clerk_token(good)["sub"] == "user_abc123"

        bad = make_token(private_key, overrides={"aud": "https://other.app"})
        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(bad)

    def test_unconfigured_verification_raises(
        self, rsa_keys: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "clerk_jwks_url", "")
        monkeypatch.setattr(settings, "clerk_issuer", "")
        security.reset_jwks_client()
        private_key, _ = rsa_keys
        token = make_token(private_key)

        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token(token)

    def test_garbage_token_rejected(
        self, mock_jwks: dict[str, Any]
    ) -> None:
        with pytest.raises(security.AuthenticationError):
            security.verify_clerk_token("not-a-jwt")


# ---------------------------------------------------------------------------
# JWKS resolution and caching
# ---------------------------------------------------------------------------


class _FakeHttpJwksResponse(io.BytesIO):
    """File-like response for urllib.request.urlopen (context manager)."""

    def __enter__(self) -> "_FakeHttpJwksResponse":
        return self

    def __exit__(self, *args: object) -> bool:
        self.close()
        return False


def _install_jwks_server(
    monkeypatch: pytest.MonkeyPatch,
    jwks_by_call: list[dict[str, Any]],
) -> list[int]:
    """Serve a sequence of JWKS payloads over HTTP (real PyJWKClient caching).

    Returns a list that records one entry per network fetch, so tests can
    assert how often the JWKS endpoint was actually hit.
    """
    calls: list[int] = []

    def fake_urlopen(request: object, *args: object, **kwargs: object) -> _FakeHttpJwksResponse:
        index = len(calls)
        calls.append(index)
        payload = jwks_by_call[min(index, len(jwks_by_call) - 1)]
        return _FakeHttpJwksResponse(json.dumps(payload).encode("utf-8"))

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    return calls


class TestJwksCaching:
    def test_jwks_fetched_once_across_verifies(
        self,
        monkeypatch: pytest.MonkeyPatch,
        rsa_keys: tuple[Any, Any],
        clerk_env: None,
    ) -> None:
        _, public_key = rsa_keys
        fetches = _install_jwks_server(monkeypatch, [make_jwks(public_key)])

        private_key, _ = rsa_keys
        token = make_token(private_key)

        security.verify_clerk_token(token)
        security.verify_clerk_token(token)
        security.verify_clerk_token(token)

        assert len(fetches) == 1

    def test_jwks_client_is_reused(
        self, clerk_env: None
    ) -> None:
        client_a = security.get_jwks_client()
        client_b = security.get_jwks_client()
        assert client_a is client_b

    def test_key_rotation_unknown_kid_triggers_refresh(
        self,
        monkeypatch: pytest.MonkeyPatch,
        rsa_keys: tuple[Any, Any],
        other_private_key: Any,
        clerk_env: None,
    ) -> None:
        """When a token's kid is missing from the cached JWKS, PyJWKClient
        refetches once (rotation support). The second fetch serves the new key."""
        _, old_public = rsa_keys
        new_public = other_private_key.public_key()

        fetches = _install_jwks_server(
            monkeypatch,
            [
                make_jwks(old_public, kid="old-key"),
                make_jwks(new_public, kid="new-key"),
            ],
        )

        # Prime the cache with the old key set
        old_token = make_token(rsa_keys[0], kid="old-key")
        claims = security.verify_clerk_token(old_token)
        assert claims["sub"] == "user_abc123"
        assert len(fetches) == 1

        # Token signed with the rotated-in key → cache miss → refetch
        new_token = make_token(other_private_key, kid="new-key")
        claims = security.verify_clerk_token(new_token)
        assert claims["sub"] == "user_abc123"
        assert len(fetches) == 2

        # Subsequent verify of the new key hits the refreshed cache
        security.verify_clerk_token(new_token)
        assert len(fetches) == 2


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class TestAuthMeEndpoint:
    def test_missing_token_returns_401(self, mock_jwks: dict[str, Any]) -> None:
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_invalid_token_returns_401(self, mock_jwks: dict[str, Any]) -> None:
        with TestClient(app) as client:
            response = client.get(
                "/api/v1/auth/me", headers=auth_header("garbage.token.here")
            )
        assert response.status_code == 401

    def test_expired_token_returns_401(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        now = int(time.time())
        token = make_token(
            private_key, overrides={"exp": now - 120, "iat": now - 600, "nbf": now - 600}
        )
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/me", headers=auth_header(token))
        assert response.status_code == 401

    def test_invalid_signature_returns_401(
        self,
        mock_jwks: dict[str, Any],
        other_private_key: Any,
    ) -> None:
        token = make_token(other_private_key)
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/me", headers=auth_header(token))
        assert response.status_code == 401

    def test_incorrect_issuer_returns_401(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, overrides={"iss": "https://not-clerk.example"})
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/me", headers=auth_header(token))
        assert response.status_code == 401

    def test_incorrect_azp_returns_401(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, overrides={"azp": "https://evil.example"})
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/me", headers=auth_header(token))
        assert response.status_code == 401

    def test_valid_token_returns_200_with_verified_sub(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key)
        with TestClient(app) as client:
            response = client.get("/api/v1/auth/me", headers=auth_header(token))
        assert response.status_code == 200
        body = response.json()
        assert body == {"user_id": "user_abc123", "authenticated": True}

    def test_non_bearer_scheme_returns_401(
        self, mock_jwks: dict[str, Any], rsa_keys: tuple[Any, Any]
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key)
        with TestClient(app) as client:
            response = client.get(
                "/api/v1/auth/me", headers={"Authorization": f"Basic {token}"}
            )
        assert response.status_code == 401

    def test_error_detail_does_not_leak_verification_internals(
        self, mock_jwks: dict[str, Any]
    ) -> None:
        with TestClient(app) as client:
            response = client.get(
                "/api/v1/auth/me", headers=auth_header("not-a-jwt")
            )
        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail == "Invalid or expired token"
        # No stack traces / library errors in the body
        assert "Traceback" not in str(response.text)
        assert "PyJWT" not in str(response.text)


# ---------------------------------------------------------------------------
# Public endpoints remain accessible
# ---------------------------------------------------------------------------


class TestPublicEndpoints:
    def test_health_still_public(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "notemint-api"}

    def test_health_info_still_public(self) -> None:
        with TestClient(app) as client:
            response = client.get("/api/v1/health/info")
        assert response.status_code == 200
        assert response.json()["api_prefix"] == "/api/v1"
