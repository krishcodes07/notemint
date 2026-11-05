"""Neon Object Storage — S3-compatible boto3 client factory.

Neon Object Storage is branch-scoped and private by default. Credentials
(``AWS_ACCESS_KEY_ID`` / ``AWS_SECRET_ACCESS_KEY``) are server-side secrets
and must never reach the browser or logs.
"""

from __future__ import annotations

import logging
from functools import lru_cache

import boto3
from botocore.client import BaseClient
from botocore.config import Config

from app.core.config import settings

logger = logging.getLogger(__name__)

# Neon's S3-compatible endpoint requires path-style addressing
# (https://endpoint/bucket/key rather than bucket.endpoint/key).
_BOTO_CONFIG = Config(
    s3={"addressing_style": "path"},
    retries={"max_attempts": 3, "mode": "standard"},
)


class StorageNotConfiguredError(RuntimeError):
    """Raised when Object Storage environment variables are missing."""


class StorageUnavailableError(RuntimeError):
    """Raised when the storage backend cannot be reached or rejects a call."""


class StorageObjectNotFoundError(LookupError):
    """Raised when a requested object does not exist."""


def _require_storage_settings() -> tuple[str, str, str, str, str]:
    if not settings.storage_configured:
        raise StorageNotConfiguredError(
            "Neon Object Storage is not configured. Set AWS_ACCESS_KEY_ID, "
            "AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3 and AWS_REGION."
        )
    bucket = settings.neon_storage_bucket.strip()
    if not bucket:
        raise StorageNotConfiguredError("NEON_STORAGE_BUCKET is not set.")
    return (
        settings.aws_endpoint_url_s3,
        settings.aws_region,
        settings.aws_access_key_id,
        settings.aws_secret_access_key,
        bucket,
    )


@lru_cache(maxsize=1)
def get_s3_client() -> BaseClient:
    """Return the shared boto3 S3 client (created on first use)."""
    endpoint, region, key_id, secret, _bucket = _require_storage_settings()
    logger.info("Creating S3 client for Neon Object Storage (region=%s)", region)
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        config=_BOTO_CONFIG,
    )


def get_storage_bucket() -> str:
    """Return the configured private bucket name."""
    return _require_storage_settings()[4]


def reset_s3_client() -> None:
    """Drop the cached client (tests / credential rotation)."""
    get_s3_client.cache_clear()
