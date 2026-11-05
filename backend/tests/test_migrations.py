"""Migration tests — Alembic configuration and schema management.

Runs against a temporary SQLite database (no Neon credentials required).
The real Neon migration was applied and verified during Phase 3 execution;
`alembic check` against Neon reported no schema/model drift.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_DIR = BACKEND_DIR / "alembic"


def _alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture()
def sqlite_url(tmp_path: Path) -> str:
    return f"sqlite:///{tmp_path / 'migration-test.db'}"


class TestAlembicConfiguration:
    def test_alembic_ini_exists(self) -> None:
        assert (BACKEND_DIR / "alembic.ini").is_file()

    def test_alembic_ini_points_at_script_dir(self) -> None:
        config = Config(str(BACKEND_DIR / "alembic.ini"))
        script_location = config.get_main_option("script_location")
        assert script_location == "alembic"
        assert (BACKEND_DIR / script_location / "env.py").is_file()

    def test_env_py_uses_application_metadata(self) -> None:
        source = (ALEMBIC_DIR / "env.py").read_text(encoding="utf-8")
        assert "target_metadata = Base.metadata" in source
        assert "from app import models" in source  # all models registered
        assert "migration_database_url" in source  # safe URL resolution

    def test_versions_directory_exists(self) -> None:
        assert (ALEMBIC_DIR / "versions").is_dir()

    def test_initial_migration_present(self) -> None:
        migrations = list((ALEMBIC_DIR / "versions").glob("*.py"))
        migrations = [m for m in migrations if not m.name.startswith("__")]
        assert len(migrations) == 1
        content = migrations[0].read_text(encoding="utf-8")
        assert "create_table('users'" in content
        assert "create_table('documents'" in content
        assert "down_revision" in content

    def test_migration_uses_portable_server_defaults(self) -> None:
        """`sa.func.now()` compiles per-dialect (now() on PG, SQLite-safe)."""
        migrations = [
            m
            for m in (ALEMBIC_DIR / "versions").glob("*.py")
            if not m.name.startswith("__")
        ]
        content = migrations[0].read_text(encoding="utf-8")
        assert "sa.func.now()" in content
        assert "sa.text('now()')" not in content


class TestUpgradeDowngrade:
    def test_upgrade_creates_schema(self, sqlite_url: str) -> None:
        config = _alembic_config(sqlite_url)
        command.upgrade(config, "head")

        engine = create_engine(sqlite_url)
        try:
            inspector = inspect(engine)
            tables = set(inspector.get_table_names())
            assert {"users", "documents", "alembic_version"} <= tables

            user_columns = {c["name"] for c in inspector.get_columns("users")}
            assert user_columns == {
                "clerk_user_id",
                "display_name",
                "email",
                "created_at",
                "updated_at",
            }

            doc_columns = {c["name"] for c in inspector.get_columns("documents")}
            assert doc_columns == {
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

            fks = inspector.get_foreign_keys("documents")
            assert any(fk["referred_table"] == "users" for fk in fks)

            with engine.connect() as connection:
                revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar()
            assert revision  # stamped at head
        finally:
            engine.dispose()

    def test_upgrade_is_idempotent_at_head(self, sqlite_url: str) -> None:
        config = _alembic_config(sqlite_url)
        command.upgrade(config, "head")
        command.upgrade(config, "head")  # no-op, must not raise

        engine = create_engine(sqlite_url)
        try:
            tables = set(inspect(engine).get_table_names())
            assert "users" in tables
        finally:
            engine.dispose()

    def test_downgrade_removes_schema_then_upgrade_recreates(
        self, sqlite_url: str
    ) -> None:
        config = _alembic_config(sqlite_url)
        command.upgrade(config, "head")

        command.downgrade(config, "-1")
        engine = create_engine(sqlite_url)
        try:
            tables = set(inspect(engine).get_table_names())
            assert "users" not in tables
            assert "documents" not in tables
        finally:
            engine.dispose()

        command.upgrade(config, "head")
        engine = create_engine(sqlite_url)
        try:
            tables = set(inspect(engine).get_table_names())
            assert {"users", "documents"} <= tables
        finally:
            engine.dispose()

    def test_migrated_schema_accepts_app_models(self, sqlite_url: str) -> None:
        """Rows inserted through the ORM work on the migrated schema."""
        from sqlalchemy import select
        from sqlalchemy.orm import sessionmaker

        from app.models import Document, DocumentStatus, User

        config = _alembic_config(sqlite_url)
        command.upgrade(config, "head")

        engine = create_engine(sqlite_url)
        try:
            session = sessionmaker(bind=engine)()
            try:
                session.add(User(clerk_user_id="user_migration"))
                session.flush()
                session.add(
                    Document(
                        clerk_user_id="user_migration",
                        original_filename="a.pdf",
                        storage_key="users/user_migration/documents/"
                        "00000000-0000-0000-0000-000000000000/original.pdf",
                        mime_type="application/pdf",
                        file_size_bytes=10,
                        status=DocumentStatus.UPLOADED,
                    )
                )
                session.commit()

                loaded = session.execute(
                    select(User).where(User.clerk_user_id == "user_migration")
                ).scalar_one()
                assert loaded.created_at is not None
                assert len(loaded.documents) == 1
            finally:
                session.close()
        finally:
            engine.dispose()
