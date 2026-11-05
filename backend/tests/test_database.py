"""Database layer tests — engine, sessions, models, repositories (SQLite).

No Neon credentials required: everything runs against an isolated SQLite
database created by the ``sqlite_engine`` / ``db_session`` fixtures.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import BigInteger, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db import dependencies as db_dependencies
from app.db import session as db_session_module
from app.db.session import (
    DatabaseNotConfiguredError,
    build_engine,
    get_engine,
    get_session_factory,
    reset_database_resources,
    session_scope,
)
from app.models import Document, DocumentStatus, User
from app.repositories import UserRepository


# ---------------------------------------------------------------------------
# Engine initialization
# ---------------------------------------------------------------------------


class TestEngineInitialization:
    def test_build_engine_returns_engine_for_sqlite(self) -> None:
        engine = build_engine("sqlite:///:memory:")
        try:
            assert engine.url.get_backend_name() == "sqlite"
        finally:
            engine.dispose()

    def test_build_engine_accepts_postgres_url(self) -> None:
        engine = build_engine(
            "postgresql+psycopg://user:pass@localhost/db?sslmode=require"
        )
        try:
            assert engine.url.get_backend_name() == "postgresql"
        finally:
            engine.dispose()

    def test_engine_creation_is_lazy(self) -> None:
        """Building an engine must never dial the database."""
        engine = build_engine(
            "postgresql+psycopg://u:p@127.0.0.1:1/nope?connect_timeout=1"
        )
        try:
            assert not engine.pool.checkedout()
        finally:
            engine.dispose()

    def test_get_engine_raises_when_unconfigured(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "database_url", "")
        reset_database_resources()
        try:
            with pytest.raises(DatabaseNotConfiguredError):
                get_engine()
        finally:
            reset_database_resources()

    def test_app_import_does_not_initialize_engine(self) -> None:
        """Importing the app leaves DB resources uncreated (lazy startup)."""
        reset_database_resources()
        import app.main  # noqa: F401

        assert get_engine.cache_info().currsize == 0
        assert get_session_factory.cache_info().currsize == 0

    def test_session_factory_is_cached(self) -> None:
        reset_database_resources()
        try:
            factory_a = get_session_factory()
            factory_b = get_session_factory()
            assert factory_a is factory_b
        finally:
            reset_database_resources()


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------


class TestSessionLifecycle:
    def test_session_scope_commits_on_success(
        self, db_sessionmaker: sessionmaker, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            db_session_module, "get_session_factory", lambda: db_sessionmaker
        )
        with session_scope() as session:
            session.add(User(clerk_user_id="user_scope_ok"))
        with session_scope() as session:
            assert session.get(User, "user_scope_ok") is not None

    def test_session_scope_rolls_back_on_error(
        self, db_sessionmaker: sessionmaker, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            db_session_module, "get_session_factory", lambda: db_sessionmaker
        )

        class Boom(RuntimeError):
            pass

        with pytest.raises(Boom):
            with session_scope() as session:
                session.add(User(clerk_user_id="user_scope_fail"))
                raise Boom()
        with session_scope() as session:
            assert session.get(User, "user_scope_fail") is None

    def test_session_scope_returns_connection_to_pool(
        self,
        sqlite_engine,
        db_sessionmaker: sessionmaker,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            db_session_module, "get_session_factory", lambda: db_sessionmaker
        )
        assert sqlite_engine.pool.checkedout() == 0
        with session_scope() as session:
            session.execute(text("SELECT 1"))
            assert sqlite_engine.pool.checkedout() == 1
        assert sqlite_engine.pool.checkedout() == 0

    def test_get_db_yields_session_and_closes_it(
        self,
        sqlite_engine,
        db_sessionmaker: sessionmaker,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            db_dependencies, "get_session_factory", lambda: db_sessionmaker
        )
        generator = db_dependencies.get_db()
        session = next(generator)
        assert isinstance(session, Session)
        session.execute(text("SELECT 1"))  # first use checks out a connection
        assert sqlite_engine.pool.checkedout() == 1
        with pytest.raises(StopIteration):
            next(generator)
        assert sqlite_engine.pool.checkedout() == 0

    def test_get_db_rolls_back_on_endpoint_error(
        self,
        sqlite_engine,
        db_sessionmaker: sessionmaker,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(
            db_dependencies, "get_session_factory", lambda: db_sessionmaker
        )
        generator = db_dependencies.get_db()
        session = next(generator)
        session.add(User(clerk_user_id="user_getdb_fail"))
        session.flush()
        with pytest.raises(RuntimeError):
            generator.throw(RuntimeError("endpoint failed"))
        assert sqlite_engine.pool.checkedout() == 0

        verification = db_sessionmaker()
        try:
            assert verification.get(User, "user_getdb_fail") is None
        finally:
            verification.close()


# ---------------------------------------------------------------------------
# User model + repository
# ---------------------------------------------------------------------------


class TestUserModel:
    def test_create_user(self, db_session: Session) -> None:
        user = User(clerk_user_id="user_create_1")
        db_session.add(user)
        db_session.commit()

        loaded = db_session.get(User, "user_create_1")
        assert loaded is not None
        assert loaded.display_name is None
        assert loaded.email is None
        assert loaded.created_at is not None
        assert loaded.updated_at is not None

    def test_created_at_is_timezone_aware(self, db_session: Session) -> None:
        db_session.add(User(clerk_user_id="user_ts"))
        db_session.commit()
        loaded = db_session.get(User, "user_ts")
        assert loaded.created_at is not None
        if loaded.created_at.tzinfo is None:
            # SQLite stores naive timestamps; PostgreSQL uses timestamptz
            # (verified live against Neon during Phase 3 execution).
            assert db_session.get_bind().dialect.name == "sqlite"

    def test_primary_key_is_clerk_user_id(self, sqlite_engine) -> None:
        inspector = inspect(sqlite_engine)
        pk = inspector.get_pk_constraint("users")
        assert pk["constrained_columns"] == ["clerk_user_id"]


class TestUserUpsert:
    def test_upsert_creates_on_first_use(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        user = repo.upsert("user_new")
        db_session.commit()

        assert user.clerk_user_id == "user_new"
        assert repo.get_by_clerk_id("user_new") is not None

    def test_upsert_does_not_duplicate(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        repo.upsert("user_once")
        repo.upsert("user_once")
        repo.upsert("user_once")
        db_session.commit()

        rows = repo.list_for_user("user_once")
        count = db_session.execute(
            text("SELECT COUNT(*) FROM users WHERE clerk_user_id='user_once'")
        ).scalar()
        assert len(rows) == 1
        assert count == 1

    def test_upsert_returns_existing_row(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        first = repo.upsert("user_same")
        db_session.flush()
        second = repo.upsert("user_same")
        assert first is second

    def test_upsert_updates_trusted_fields(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        repo.upsert("user_fields")
        db_session.flush()
        updated = repo.upsert("user_fields", display_name="Krish")
        assert updated.display_name == "Krish"
        # None means "not provided" — never wipes existing data
        again = repo.upsert("user_fields")
        assert again.display_name == "Krish"

    def test_duplicate_insert_raises_integrity_error(
        self, db_session: Session
    ) -> None:
        repo = UserRepository(db_session)
        repo.create("user_dup")
        db_session.flush()
        with pytest.raises(IntegrityError):
            repo.create("user_dup")
        db_session.rollback()


class TestUserIsolation:
    def test_users_are_isolated(self, db_session: Session) -> None:
        repo = UserRepository(db_session)
        repo.upsert("user_alice")
        repo.upsert("user_bob")
        db_session.flush()

        assert repo.list_for_user("user_alice") == [
            db_session.get(User, "user_alice")
        ]
        assert repo.get_by_clerk_id("user_alice").clerk_user_id == "user_alice"
        assert repo.get_by_clerk_id("user_bob").clerk_user_id == "user_bob"
        assert repo.get_by_clerk_id("user_mallory") is None

    def test_delete_only_targets_requested_user(
        self, db_session: Session
    ) -> None:
        repo = UserRepository(db_session)
        repo.upsert("user_victim")
        repo.upsert("user_bystander")
        db_session.flush()

        assert repo.delete("user_victim") is True
        assert repo.delete("user_victim") is False
        assert repo.get_by_clerk_id("user_victim") is None
        assert repo.get_by_clerk_id("user_bystander") is not None


# ---------------------------------------------------------------------------
# Document model + relationships
# ---------------------------------------------------------------------------


def _make_document(
    clerk_user_id: str, *, storage_key: str | None = None
) -> Document:
    doc_id = uuid.uuid4()
    return Document(
        id=doc_id,
        clerk_user_id=clerk_user_id,
        original_filename="notes.pdf",
        storage_key=storage_key
        or f"users/{clerk_user_id}/documents/{doc_id}/original.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        status=DocumentStatus.UPLOADED,
    )


class TestDocumentModel:
    def test_create_document(self, db_session: Session) -> None:
        db_session.add(User(clerk_user_id="user_doc"))
        db_session.flush()

        doc = _make_document("user_doc")
        db_session.add(doc)
        db_session.commit()

        loaded = db_session.get(Document, doc.id)
        assert loaded is not None
        assert loaded.original_filename == "notes.pdf"
        assert loaded.status == DocumentStatus.UPLOADED
        assert loaded.page_count is None
        assert loaded.file_size_bytes == 1024
        assert loaded.created_at is not None

    def test_foreign_key_relationship(self, db_session: Session) -> None:
        db_session.add(User(clerk_user_id="user_rel"))
        db_session.flush()

        doc = _make_document("user_rel")
        db_session.add(doc)
        db_session.commit()

        owner = db_session.get(User, "user_rel")
        assert owner.documents == [doc]
        assert doc.owner is owner

    def test_document_requires_existing_owner(self, db_session: Session) -> None:
        db_session.add(_make_document("user_ghost"))
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_storage_key_is_unique(self, db_session: Session) -> None:
        db_session.add(User(clerk_user_id="user_unique"))
        db_session.flush()

        doc_a = _make_document("user_unique")
        db_session.add(doc_a)
        db_session.commit()

        doc_b = _make_document("user_unique", storage_key=doc_a.storage_key)
        db_session.add(doc_b)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_invalid_status_rejected_by_database(
        self, db_session: Session
    ) -> None:
        """The CHECK constraint enforces the status vocabulary in the DB."""
        db_session.add(User(clerk_user_id="user_status"))
        db_session.flush()
        db_session.add(_make_document("user_status"))
        db_session.commit()

        with pytest.raises(SQLAlchemyError):
            db_session.execute(
                text(
                    "UPDATE documents SET status='bogus' "
                    "WHERE clerk_user_id='user_status'"
                )
            )
        db_session.rollback()

    def test_orm_cascade_delete_removes_documents(
        self, db_session: Session
    ) -> None:
        db_session.add(User(clerk_user_id="user_cascade"))
        db_session.flush()
        db_session.add(_make_document("user_cascade"))
        db_session.add(_make_document("user_cascade"))
        db_session.commit()

        repo = UserRepository(db_session)
        assert repo.delete("user_cascade") is True
        db_session.commit()

        remaining = db_session.execute(
            text(
                "SELECT COUNT(*) FROM documents "
                "WHERE clerk_user_id='user_cascade'"
            )
        ).scalar()
        assert remaining == 0

    def test_documents_table_schema(self, sqlite_engine) -> None:
        inspector = inspect(sqlite_engine)
        columns = {c["name"]: c for c in inspector.get_columns("documents")}
        assert set(columns) == {
            "id",
            "clerk_user_id",
            "original_filename",
            "storage_key",
            "mime_type",
            "file_size_bytes",
            "status",
            "page_count",
            "created_at",
            "updated_at",
        }
        assert isinstance(columns["file_size_bytes"]["type"], BigInteger)
        assert columns["page_count"]["nullable"] is True
        assert columns["clerk_user_id"]["nullable"] is False

        fks = inspector.get_foreign_keys("documents")
        assert any(fk["referred_table"] == "users" for fk in fks)

        index_names = {i["name"] for i in inspector.get_indexes("documents")}
        assert "ix_documents_clerk_user_id" in index_names

        unique_constraints = {
            c["name"] for c in inspector.get_unique_constraints("documents")
        }
        assert "uq_documents_storage_key" in unique_constraints
