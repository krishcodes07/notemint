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

    # --- Document Uploads (Phase 5) ---
    max_upload_size_mb: int = Field(default=20)

    # --- Redis & Celery Background Processing (Phase 6) ---
    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="")
    celery_result_backend: str = Field(default="")
    celery_task_always_eager: bool = Field(default=False)

    # --- PDF Extraction Engine Configuration (Phase 6) ---
    max_extraction_pages: int = Field(default=500)
    max_extraction_text_length: int = Field(default=10_000_000)
    extraction_low_text_threshold: int = Field(default=50)
    extraction_scanned_ratio_threshold: float = Field(default=0.8)

    # --- AI Integration & Kilo Gateway (Phase 7) ---
    kilo_api_key: str = Field(default="")
    kilo_base_url: str = Field(default="https://api.kilo.ai/api/gateway")
    kilo_model: str = Field(default="nvidia/nemotron-3-ultra-550b-a55b:free")
    ai_request_timeout_seconds: int = Field(default=120)
    ai_max_output_tokens: int = Field(default=4096)
    ai_temperature: float = Field(default=0.3)
    ai_max_context_tokens: int = Field(default=16000)
    ai_max_retries: int = Field(default=3)

    # --- Phase 9: AI Teacher & Interactive Chat Tutor ---
    ai_teacher_max_message_chars: int = Field(default=4000)
    ai_teacher_max_history_tokens: int = Field(default=4000)
    ai_teacher_max_context_tokens: int = Field(default=12000)
    ai_teacher_max_source_pages: int = Field(default=8)
    ai_teacher_max_output_tokens: int = Field(default=2048)

    # --- Phase 10: RAG & Semantic Retrieval Engine ---
    rag_enabled: bool = Field(default=True)
    embedding_provider: str = Field(default="local")
    embedding_model: str = Field(default="BAAI/bge-small-en-v1.5")
    embedding_dimensions: int = Field(default=384)
    rag_chunk_target_tokens: int = Field(default=450)
    rag_chunk_overlap_tokens: int = Field(default=75)
    rag_top_k: int = Field(default=8)
    rag_max_context_tokens: int = Field(default=12000)
    rag_vector_weight: float = Field(default=0.65)
    rag_keyword_weight: float = Field(default=0.35)
    rag_index_batch_size: int = Field(default=32)
    rag_max_index_retries: int = Field(default=3)

    # --- Phase 11: Advanced AI Generation & Custom Practice ---
    ai_additional_generation_max_items: int = Field(default=30)
    ai_additional_generation_default_items: int = Field(default=10)

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
    def ai_configured(self) -> bool:
        """True when an AI API key is configured."""
        return bool(self.kilo_api_key.strip())

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
    def max_upload_size_bytes(self) -> int:
        """Maximum permitted file upload size in bytes."""
        return self.max_upload_size_mb * 1024 * 1024

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

    @property
    def resolved_celery_broker_url(self) -> str:
        """Effective broker URL for Celery."""
        return self.celery_broker_url.strip() or self.redis_url.strip()

    @property
    def resolved_celery_result_backend(self) -> str:
        """Effective result backend for Celery."""
        return self.celery_result_backend.strip() or self.redis_url.strip()


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()


settings = get_settings()
