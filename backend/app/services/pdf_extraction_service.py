"""PDF Extraction Engine using PyMuPDF (Phase 6).

Extracts text, page metrics, metadata, and quality diagnostics from uploaded PDFs.
Detects empty pages, low-text pages, and scanned/image-only documents.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, BinaryIO

import pymupdf

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Whitespace normalization patterns
_MULTI_SPACE_PATTERN = re.compile(r"[ \t]+")
_MULTI_NEWLINE_PATTERN = re.compile(r"\n{3,}")


class PdfExtractionError(Exception):
    """Base error for PDF extraction failures."""


class EncryptedPdfError(PdfExtractionError):
    """PDF is password-protected or encrypted."""


class CorruptedPdfError(PdfExtractionError):
    """PDF file is corrupted or cannot be parsed."""


class EmptyPdfError(PdfExtractionError):
    """PDF has no pages."""


class ExtractionLimitExceededError(PdfExtractionError):
    """PDF exceeds maximum allowed page count or character limits."""


@dataclass(frozen=True)
class PageExtractionResult:
    """Extraction data for an individual PDF page."""

    page_number: int  # 1-indexed
    text: str
    character_count: int
    has_text: bool
    has_images: bool = False


@dataclass
class ExtractionQuality:
    """Quality and diagnostic metrics for extracted document content."""

    is_scanned: bool
    ocr_required: bool
    empty_pages: list[int]
    low_text_pages: list[int]
    extraction_success: bool
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_scanned": self.is_scanned,
            "ocr_required": self.ocr_required,
            "empty_pages": self.empty_pages,
            "low_text_pages": self.low_text_pages,
            "extraction_success": self.extraction_success,
            "reason": self.reason,
        }


@dataclass
class ExtractionResult:
    """Aggregated extraction result for an entire PDF document."""

    metadata: dict[str, Any]
    total_characters: int
    page_count: int
    pages: list[PageExtractionResult]
    quality: ExtractionQuality
    engine: str = field(default_factory=lambda: f"pymupdf-{pymupdf.__version__}")


def normalize_whitespace(raw_text: str) -> str:
    """Normalize extracted text whitespace without losing meaningful layout.

    - Replaces non-breaking spaces (\xa0) with standard spaces.
    - Normalizes CRLF and CR to LF (\n).
    - Strips trailing/leading space per line.
    - Collapses multiple horizontal spaces or tabs to a single space.
    - Collapses 3 or more consecutive newlines into 2 (preserving paragraph breaks).
    - Strips overall leading/trailing whitespace.
    """
    if not raw_text:
        return ""

    text = raw_text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    lines = text.split("\n")
    cleaned_lines = [_MULTI_SPACE_PATTERN.sub(" ", line).strip() for line in lines]
    cleaned = "\n".join(cleaned_lines)
    cleaned = _MULTI_NEWLINE_PATTERN.sub("\n\n", cleaned)
    return cleaned.strip()


class PdfExtractionService:
    """Dedicated service for reliable, page-by-page PDF text extraction."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def extract_from_path(self, file_path: str | Path) -> ExtractionResult:
        """Extract text and metadata from a PDF file located on disk."""
        path_str = str(file_path)
        try:
            doc = pymupdf.open(path_str)
        except pymupdf.FileDataError as exc:
            logger.warning("Corrupted or invalid PDF file: %s", type(exc).__name__)
            raise CorruptedPdfError("PDF file is corrupted or has an invalid format") from exc
        except Exception as exc:
            logger.warning("Failed to open PDF from path: %s", type(exc).__name__)
            raise CorruptedPdfError("Failed to open PDF file") from exc

        try:
            return self._process_document(doc)
        finally:
            doc.close()

    def extract_from_bytes(self, pdf_bytes: bytes) -> ExtractionResult:
        """Extract text and metadata from in-memory PDF bytes."""
        if not pdf_bytes:
            raise EmptyPdfError("PDF byte stream is empty")

        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        except pymupdf.FileDataError as exc:
            logger.warning("Corrupted or invalid PDF bytes: %s", type(exc).__name__)
            raise CorruptedPdfError("PDF file is corrupted or has an invalid format") from exc
        except Exception as exc:
            logger.warning("Failed to open PDF from bytes: %s", type(exc).__name__)
            raise CorruptedPdfError("Failed to parse PDF bytes") from exc

        try:
            return self._process_document(doc)
        finally:
            doc.close()

    def extract_from_stream(self, stream: BinaryIO) -> ExtractionResult:
        """Extract text and metadata from a file-like binary stream."""
        pdf_bytes = stream.read()
        return self.extract_from_bytes(pdf_bytes)

    def _process_document(self, doc: pymupdf.Document) -> ExtractionResult:
        """Internal processing pipeline for an opened PyMuPDF Document."""
        # 1. Check encryption / password protection
        if doc.is_encrypted:
            # Try authenticating with empty string (standard check for read-allowed encrypted PDFs)
            if not doc.authenticate(""):
                raise EncryptedPdfError("PDF is encrypted and password-protected")

        # 2. Check page count and limits
        page_count = len(doc)
        if page_count == 0:
            raise EmptyPdfError("PDF contains no pages")

        if page_count > self._settings.max_extraction_pages:
            raise ExtractionLimitExceededError(
                f"PDF page count ({page_count}) exceeds maximum allowed "
                f"limit of {self._settings.max_extraction_pages}"
            )

        # 3. Extract document metadata
        raw_meta = doc.metadata or {}
        extracted_metadata = {
            "title": (raw_meta.get("title") or "").strip() or None,
            "author": (raw_meta.get("author") or "").strip() or None,
            "subject": (raw_meta.get("subject") or "").strip() or None,
            "creator": (raw_meta.get("creator") or "").strip() or None,
            "producer": (raw_meta.get("producer") or "").strip() or None,
            "creation_date": (raw_meta.get("creationDate") or "").strip() or None,
            "mod_date": (raw_meta.get("modDate") or "").strip() or None,
            "format": (raw_meta.get("format") or "").strip() or None,
            "page_count": page_count,
        }

        # 4. Page-by-page extraction
        pages_result: list[PageExtractionResult] = []
        empty_pages: list[int] = []
        low_text_pages: list[int] = []
        image_only_pages: list[int] = []
        total_characters = 0

        low_threshold = self._settings.extraction_low_text_threshold
        max_chars = self._settings.max_extraction_text_length

        for page_idx in range(page_count):
            page_num = page_idx + 1
            page = doc[page_idx]

            raw_text = page.get_text("text") or ""
            cleaned_text = normalize_whitespace(raw_text)
            char_count = len(cleaned_text)

            # Check for images on this page
            try:
                images = page.get_images(full=True)
                has_images = len(images) > 0
            except Exception:
                has_images = False

            has_meaningful_text = char_count >= low_threshold

            if char_count == 0:
                empty_pages.append(page_num)
                if has_images:
                    image_only_pages.append(page_num)
            elif char_count < low_threshold:
                low_text_pages.append(page_num)
                if has_images:
                    image_only_pages.append(page_num)

            total_characters += char_count
            if total_characters > max_chars:
                raise ExtractionLimitExceededError(
                    f"Total extracted text length ({total_characters}) exceeds "
                    f"configured limit of {max_chars} characters"
                )

            pages_result.append(
                PageExtractionResult(
                    page_number=page_num,
                    text=cleaned_text,
                    character_count=char_count,
                    has_text=has_meaningful_text,
                    has_images=has_images,
                )
            )

        # 5. Extraction quality and scanned PDF diagnostics
        quality = self._evaluate_quality(
            page_count=page_count,
            total_characters=total_characters,
            empty_pages=empty_pages,
            low_text_pages=low_text_pages,
            image_only_pages=image_only_pages,
            any_images=any(p.has_images for p in pages_result),
        )

        return ExtractionResult(
            metadata=extracted_metadata,
            total_characters=total_characters,
            page_count=page_count,
            pages=pages_result,
            quality=quality,
            engine=f"pymupdf-{pymupdf.__version__}",
        )

    def _evaluate_quality(
        self,
        *,
        page_count: int,
        total_characters: int,
        empty_pages: list[int],
        low_text_pages: list[int],
        image_only_pages: list[int],
        any_images: bool,
    ) -> ExtractionQuality:
        """Analyze extraction metrics to determine if the PDF is scanned or text-based."""
        scanned_threshold = self._settings.extraction_scanned_ratio_threshold

        # Case A: Exactly 0 characters extracted across all pages
        if total_characters == 0:
            if any_images:
                return ExtractionQuality(
                    is_scanned=True,
                    ocr_required=True,
                    empty_pages=empty_pages,
                    low_text_pages=low_text_pages,
                    extraction_success=False,
                    reason="Scanned or image-only PDF. OCR is required to extract text.",
                )
            return ExtractionQuality(
                is_scanned=False,
                ocr_required=False,
                empty_pages=empty_pages,
                low_text_pages=low_text_pages,
                extraction_success=False,
                reason="Document contains no extractable text or visual content.",
            )

        # Case B: Some characters, but majority of pages are image-only with negligible text
        image_only_ratio = len(image_only_pages) / page_count
        if (
            image_only_ratio >= scanned_threshold
            and total_characters < (page_count * self._settings.extraction_low_text_threshold * 2)
        ):
            return ExtractionQuality(
                is_scanned=True,
                ocr_required=True,
                empty_pages=empty_pages,
                low_text_pages=low_text_pages,
                extraction_success=False,
                reason=(
                    f"Likely scanned document: {len(image_only_pages)} of {page_count} "
                    f"pages contain images with negligible selectable text. OCR is required."
                ),
            )

        # Case C: Usable text extracted successfully
        return ExtractionQuality(
            is_scanned=False,
            ocr_required=False,
            empty_pages=empty_pages,
            low_text_pages=low_text_pages,
            extraction_success=True,
            reason=None,
        )

