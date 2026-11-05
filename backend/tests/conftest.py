"""Shared test fixtures.

Ordinary unit tests run against an isolated SQLite database and mocked
external services — no Neon credentials or network access required.
Optional live tests skip themselves when credentials are absent.
"""

from __future__ import annotations

import json
import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt import PyJWKClient
from jwt.algorithms import RSAAlgorithm
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core import security
from app.core.config import settings
from app.db.base import Base
from app.db.dependencies import get_db

ISSUER = "https://clerk.example.dev"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"
AUTHORIZED_PARTIES = "http://localhost:3000"


# ---------------------------------------------------------------------------
# Database fixtures (isolated SQLite, never the real Neon database)
# ---------------------------------------------------------------------------


@pytest.fixture()
def sqlite_engine(tmp_path: Any) -> Engine:
    """A file-backed SQLite engine with the full app schema applied."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'notemint-test.db'}",
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection: Any, _: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_sessionmaker(sqlite_engine: Engine) -> sessionmaker[Session]:
    """Session factory bound to the isolated test database."""
    return sessionmaker(
        bind=sqlite_engine, expire_on_commit=False, autoflush=False
    )


@pytest.fixture()
def db_session(db_sessionmaker: sessionmaker[Session]) -> Session:
    """A single long-lived session for model/repository tests."""
    session = db_sessionmaker()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_sessionmaker: sessionmaker[Session]) -> Any:
    """TestClient with the real app + ``get_db`` overridden to SQLite."""
    from app.main import app

    def override_get_db() -> Any:
        session = db_sessionmaker()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Clerk JWT fixtures (mocked JWKS — same pattern as tests/test_auth.py)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def rsa_keys() -> tuple[Any, Any]:
    """Module-scoped RSA keypair (private, public)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


def make_jwks(public_key: Any, kid: str = "test-key") -> dict[str, Any]:
    jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    jwk.update({"kid": kid, "use": "sig", "alg": "RS256"})
    return {"keys": [jwk]}


def make_token(
    private_key: Any,
    *,
    sub: str = "user_abc123",
    overrides: dict[str, Any] | None = None,
    kid: str = "test-key",
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
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
        headers={"kid": kid},
    )


@pytest.fixture
def clerk_env(monkeypatch: pytest.MonkeyPatch) -> Any:
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
    """Serve a static JWKS instead of hitting the network."""
    _, public_key = rsa_keys
    jwks = make_jwks(public_key)
    monkeypatch.setattr(PyJWKClient, "fetch_data", lambda self: jwks)
    return jwks


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
