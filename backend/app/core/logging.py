"""Logging configuration for the NoteMint API."""

import logging
import sys

from app.core.config import settings

LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
)
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def configure_logging() -> None:
    """Configure root logging once at application startup."""
    root_logger = logging.getLogger()
    root_logger.setLevel(settings.log_level)

    if root_logger.handlers:
        return

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(
        logging.Formatter(fmt=LOG_FORMAT, datefmt=DATE_FORMAT)
    )
    root_logger.addHandler(handler)

    # Quiet noisy third-party loggers in development.
    if settings.is_development:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
