"""Centralized application configuration via Pydantic Settings."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = Field(default="NoteMint API")
    app_env: str = Field(default="development")
    api_v1_prefix: str = Field(default="/api/v1")
    frontend_url: str = Field(default="http://localhost:3000")
    log_level: str = Field(default="INFO")

    # --- Clerk authentication (Phase 2) ---
    # JWKS endpoint for session-token signature verification.
    # Example: https://<instance>.clerk.accounts.dev/.well-known/jwks.json
    clerk_jwks_url: str = Field(default="")
    # Expected JWT `iss` claim (Clerk Frontend API URL, no trailing slash).
    # Example: https://<instance>.clerk.accounts.dev
    clerk_issuer: str = Field(default="")
    # Comma-separated origins allowed in the `azp` claim. Empty = skip check.
    clerk_authorized_parties: str = Field(default="http://localhost:3000")
    # Optional JWT `aud` claim. Empty = skip audience verification.
    clerk_audience: str = Field(default="")

    # --- Neon PostgreSQL (Phase 3) ---
    # Runtime connection string (prefer Neon's pooled URL). SQLAlchemy
    # driver prefix: postgresql+psycopg://...  Never logged or exposed.
    database_url: str = Field(default="")
    # Direct (non-pooler) URL for Alembic migrations when available.
    # Falls back to database_url when empty.
    direct_database_url: str = Field(default="")

    # --- Neon Object Storage (Phase 3, S3-compatible) ---
    aws_access_key_id: str = Field(default="")
    aws_secret_access_key: str = Field(default="")
    aws_endpoint_url_s3: str = Field(default="")
    aws_region: str = Field(default="")
    neon_storage_bucket: str = Field(default="notemint-files")

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        allowed = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}
        normalized = value.upper()
        if normalized not in allowed:
            raise ValueError(
                f"LOG_LEVEL must be one of {sorted(allowed)}, got {value!r}"
            )
        return normalized

    @property
    def cors_origins(self) -> list[str]:
        """Origins allowed by CORS: the configured frontend URL."""
        return [self.frontend_url]

    @property
    def is_development(self) -> bool:
        return self.app_env.lower() == "development"

    @property
    def database_configured(self) -> bool:
        """True when a database connection string is available."""
        return bool(self.database_url.strip())

    @property
    def migration_database_url(self) -> str:
        """Connection string for Alembic: direct URL when available.

        Neon's pooled (pgbouncer) endpoint is fine for runtime queries but
        direct connections are preferred for DDL/migrations.
        """
        direct = self.direct_database_url.strip()
        if direct:
            return direct
        return self.database_url.strip()

    @property
    def storage_configured(self) -> bool:
        """True when Object Storage credentials and endpoint are available."""
        return bool(
            self.aws_access_key_id.strip()
            and self.aws_secret_access_key.strip()
            and self.aws_endpoint_url_s3.strip()
            and self.aws_region.strip()
        )

    @property
    def authorized_parties(self) -> list[str]:
        """Parsed list of origins permitted in the `azp` claim."""
        if not self.clerk_authorized_parties.strip():
            return []
        return [
            party.strip()
            for party in self.clerk_authorized_parties.split(",")
            if party.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()


settings = get_settings()
