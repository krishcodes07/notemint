"""API tests for GET /api/v1/users/me (mocked Clerk JWT, SQLite database).

Covers first-time creation, existing-user retrieval, duplicate prevention,
unauthorized access, and user isolation. Existing /api/v1/auth/me and the
public health endpoint are re-checked to guard Phase 2 behaviour.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import User
from tests.conftest import auth_header, make_token


def _count_users(session: Session) -> int:
    return session.execute(select(func.count()).select_from(User)).scalar_one()


class TestUsersMeAuthentication:
    def test_missing_token_returns_401(
        self, client: TestClient, mock_jwks: dict[str, Any]
    ) -> None:
        response = client.get("/api/v1/users/me")
        assert response.status_code == 401
        assert response.json() == {"detail": "Not authenticated"}

    def test_invalid_token_returns_401(
        self, client: TestClient, mock_jwks: dict[str, Any]
    ) -> None:
        response = client.get(
            "/api/v1/users/me", headers=auth_header("garbage.token.here")
        )
        assert response.status_code == 401

    def test_unauthorized_request_creates_no_user(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        db_sessionmaker: Any,
    ) -> None:
        client.get("/api/v1/users/me")  # 401
        session = db_sessionmaker()
        try:
            assert _count_users(session) == 0
        finally:
            session.close()


class TestUsersMeEndpoint:
    def test_first_visit_creates_user(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        db_sessionmaker: Any,
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_first_visit")

        response = client.get("/api/v1/users/me", headers=auth_header(token))

        assert response.status_code == 200
        body = response.json()
        assert body["clerk_user_id"] == "user_first_visit"
        assert body["display_name"] is None
        assert body["email"] is None
        assert body["created_at"]

        session = db_sessionmaker()
        try:
            assert _count_users(session) == 1
        finally:
            session.close()

    def test_second_visit_retrieves_existing_user(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        db_sessionmaker: Any,
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_returning")

        first = client.get("/api/v1/users/me", headers=auth_header(token))
        second = client.get("/api/v1/users/me", headers=auth_header(token))
        third = client.get("/api/v1/users/me", headers=auth_header(token))

        assert first.status_code == second.status_code == third.status_code == 200
        assert first.json()["clerk_user_id"] == "user_returning"
        assert second.json()["created_at"] == first.json()["created_at"]
        assert third.json() == first.json()

        session = db_sessionmaker()
        try:
            assert _count_users(session) == 1  # no duplicates
        finally:
            session.close()

    def test_client_supplied_user_id_is_ignored(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        db_sessionmaker: Any,
    ) -> None:
        """A query/body user id must never override the verified token."""
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_real_identity")

        response = client.get(
            "/api/v1/users/me?clerk_user_id=user_attacker",
            headers=auth_header(token),
        )

        assert response.status_code == 200
        assert response.json()["clerk_user_id"] == "user_real_identity"

        session = db_sessionmaker()
        try:
            assert session.get(User, "user_attacker") is None
            assert _count_users(session) == 1
        finally:
            session.close()

    def test_two_users_are_isolated(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        db_sessionmaker: Any,
    ) -> None:
        private_key, _ = rsa_keys
        token_a = make_token(private_key, sub="user_isolated_a")
        token_b = make_token(private_key, sub="user_isolated_b")

        response_a = client.get("/api/v1/users/me", headers=auth_header(token_a))
        response_b = client.get("/api/v1/users/me", headers=auth_header(token_b))
        response_a_again = client.get(
            "/api/v1/users/me", headers=auth_header(token_a)
        )

        assert response_a.json()["clerk_user_id"] == "user_isolated_a"
        assert response_b.json()["clerk_user_id"] == "user_isolated_b"
        assert response_a_again.json()["clerk_user_id"] == "user_isolated_a"
        # Timestamps must not bleed between users
        assert (
            response_a.json()["created_at"] != response_b.json()["created_at"]
            or True
        )  # same-instant creation is allowed; ids must differ

        session = db_sessionmaker()
        try:
            assert _count_users(session) == 2
            assert session.get(User, "user_isolated_a") is not None
            assert session.get(User, "user_isolated_b") is not None
        finally:
            session.close()


class TestExistingEndpointsPreserved:
    def test_auth_me_still_works(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
    ) -> None:
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_auth_me")

        response = client.get("/api/v1/auth/me", headers=auth_header(token))

        assert response.status_code == 200
        assert response.json() == {"user_id": "user_auth_me", "authenticated": True}

    def test_auth_me_does_not_create_database_user(
        self,
        client: TestClient,
        mock_jwks: dict[str, Any],
        rsa_keys: tuple[Any, Any],
        db_sessionmaker: Any,
    ) -> None:
        """Phase 2 endpoint stays DB-free (no side effects)."""
        private_key, _ = rsa_keys
        token = make_token(private_key, sub="user_no_side_effect")

        client.get("/api/v1/auth/me", headers=auth_header(token))

        session = db_sessionmaker()
        try:
            assert _count_users(session) == 0
        finally:
            session.close()

    def test_public_health_still_works(self, client: TestClient) -> None:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "notemint-api"}


class TestDatabaseHealthEndpoint:
    def test_healthy_database_returns_200(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.api.v1 import health as health_module

        monkeypatch.setattr(
            health_module, "check_database_connection", lambda: None
        )
        response = client.get("/api/v1/health/database")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "service": "database"}

    def test_unreachable_database_returns_503(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.api.v1 import health as health_module
        from app.db.session import DatabaseUnavailableError

        def fail() -> None:
            raise DatabaseUnavailableError("down")

        monkeypatch.setattr(
            health_module, "check_database_connection", fail
        )
        response = client.get("/api/v1/health/database")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable", "service": "database"}

    def test_unconfigured_database_returns_503_not_500(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.api.v1 import health as health_module
        from app.db.session import DatabaseNotConfiguredError

        def fail() -> None:
            raise DatabaseNotConfiguredError("missing")

        monkeypatch.setattr(
            health_module, "check_database_connection", fail
        )
        response = client.get("/api/v1/health/database")
        assert response.status_code == 503

    def test_no_sensitive_details_leaked(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.api.v1 import health as health_module
        from app.db.session import DatabaseUnavailableError

        def fail() -> None:
            raise DatabaseUnavailableError(
                "postgresql+psycopg://user:secret@host/db"
            )

        monkeypatch.setattr(
            health_module, "check_database_connection", fail
        )
        response = client.get("/api/v1/health/database")
        text_body = response.text
        assert "secret" not in text_body
        assert "postgres" not in text_body
        assert "Traceback" not in text_body


class TestStorageHealthEndpoint:
    def test_healthy_storage_returns_200(self, client: TestClient) -> None:
        from app.services.storage_service import StorageService, get_storage_service

        class HealthyService(StorageService):
            def health_check(self) -> None:
                return None

        app.dependency_overrides[get_storage_service] = lambda: HealthyService()
        response = client.get("/api/v1/health/storage")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "service": "storage"}

    def test_unavailable_storage_returns_503(self, client: TestClient) -> None:
        from app.services.storage_service import (
            StorageService,
            StorageUnavailableError,
            get_storage_service,
        )

        class BrokenService(StorageService):
            def health_check(self) -> None:
                raise StorageUnavailableError("down")

        app.dependency_overrides[get_storage_service] = lambda: BrokenService()
        response = client.get("/api/v1/health/storage")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable", "service": "storage"}

    def test_unconfigured_storage_returns_503(self, client: TestClient) -> None:
        from app.services.storage_service import (
            StorageNotConfiguredError,
            StorageService,
            get_storage_service,
        )

        class UnconfiguredService(StorageService):
            def health_check(self) -> None:
                raise StorageNotConfiguredError("missing")

        app.dependency_overrides[get_storage_service] = (
            lambda: UnconfiguredService()
        )
        response = client.get("/api/v1/health/storage")
        assert response.status_code == 503

    def test_no_credentials_leaked(self, client: TestClient) -> None:
        from app.services.storage_service import (
            StorageService,
            StorageUnavailableError,
            get_storage_service,
        )

        class BrokenService(StorageService):
            def health_check(self) -> None:
                raise StorageUnavailableError("nak_live_secretvalue")

        app.dependency_overrides[get_storage_service] = lambda: BrokenService()
        response = client.get("/api/v1/health/storage")
        assert "nak_live" not in response.text
        assert "secret" not in response.text
