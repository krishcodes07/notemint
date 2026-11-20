"""Background tasks for NoteMint."""

from app.tasks.extraction import process_document_extraction

__all__ = ["process_document_extraction"]

