"""Unit tests for PdfExtractionService (Phase 6)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pymupdf
import pytest

from app.core.config import Settings
from app.services.pdf_extraction_service import (
    CorruptedPdfError,
    EmptyPdfError,
    EncryptedPdfError,
    ExtractionLimitExceededError,
    PdfExtractionService,
    normalize_whitespace,
)


def _build_test_pdf(
    pages: list[str],
    metadata: dict[str, str] | None = None,
) -> bytes:
    """Generate in-memory PDF bytes with the specified page contents and metadata."""
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        if text:
            page.insert_text((50, 72), text)
    if metadata:
        doc.set_metadata(metadata)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _build_scanned_pdf(page_count: int = 2) -> bytes:
    """Generate in-memory PDF bytes containing only images without text."""
    doc = pymupdf.open()
    for _ in range(page_count):
        page = doc.new_page()
        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 20, 20), 0)
        pix.clear_with(200)
        page.insert_image(pymupdf.Rect(50, 50, 300, 300), pixmap=pix)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _build_encrypted_pdf(password: str = "secret") -> bytes:
    """Generate password-protected encrypted PDF bytes."""
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Confidential student exam material.")
    pdf_bytes = doc.tobytes(
        encryption=pymupdf.PDF_ENCRYPT_AES_256,
        user_pw=password,
        owner_pw="ownerpass",
    )
    doc.close()
    return pdf_bytes


class TestWhitespaceNormalization:
    def test_empty_string(self) -> None:
        assert normalize_whitespace("") == ""
        assert normalize_whitespace("   \n\t  ") == ""

    def test_collapses_multiple_horizontal_spaces(self) -> None:
        raw = "Photosynthesis    is   the process\t\tby which plants..."
        expected = "Photosynthesis is the process by which plants..."
        assert normalize_whitespace(raw) == expected

    def test_preserves_single_and_double_newlines(self) -> None:
        raw = "Heading\n\nParagraph 1 text.\nNext line of paragraph.\n\nParagraph 2."
        assert normalize_whitespace(raw) == raw

    def test_collapses_excessive_newlines(self) -> None:
        raw = "Heading\n\n\n\n\nParagraph text."
        expected = "Heading\n\nParagraph text."
        assert normalize_whitespace(raw) == expected

    def test_handles_crlf_and_non_breaking_spaces(self) -> None:
        raw = "Line 1\r\n\r\nLine 2 with\xa0non-breaking\xa0space"
        expected = "Line 1\n\nLine 2 with non-breaking space"
        assert normalize_whitespace(raw) == expected


class TestPdfExtractionService:
    @pytest.fixture
    def service(self) -> PdfExtractionService:
        return PdfExtractionService()

    def test_extract_valid_single_page_pdf(self, service: PdfExtractionService) -> None:
        pdf_bytes = _build_test_pdf(
            ["Life Processes are essential functions performed by living organisms."],
            metadata={"title": "Biology Chapter 6", "author": "NCERT"},
        )
        result = service.extract_from_bytes(pdf_bytes)

        assert result.page_count == 1
        assert len(result.pages) == 1
        assert "Life Processes" in result.pages[0].text
        assert result.pages[0].page_number == 1
        assert result.pages[0].has_text is True
        assert result.total_characters > 20
        assert result.quality.extraction_success is True
        assert result.quality.is_scanned is False
        assert result.metadata["title"] == "Biology Chapter 6"
        assert result.metadata["author"] == "NCERT"

    def test_extract_multi_page_pdf_preserves_ordering(self, service: PdfExtractionService) -> None:
        pages_content = [
            "Page 1: Introduction to Chemical Reactions and Equations.",
            "Page 2: Balancing chemical equations involves conservation of mass.",
            "Page 3: Types of reactions include combination, decomposition, and displacement.",
        ]
        pdf_bytes = _build_test_pdf(pages_content)
        result = service.extract_from_bytes(pdf_bytes)

        assert result.page_count == 3
        assert len(result.pages) == 3
        for i, page in enumerate(result.pages):
            assert page.page_number == i + 1
            assert pages_content[i].split(":")[0] in page.text

    def test_extract_pdf_with_empty_and_low_text_pages(self, service: PdfExtractionService) -> None:
        pages_content = [
            "This is a substantive page with plenty of text explaining concepts in full detail for the exam.",
            "",  # Completely empty page
            "Short note.",  # Low-text page (< 50 chars)
        ]
        pdf_bytes = _build_test_pdf(pages_content)
        result = service.extract_from_bytes(pdf_bytes)

        assert result.page_count == 3
        assert result.pages[1].character_count == 0
        assert result.pages[1].has_text is False
        assert 2 in result.quality.empty_pages
        assert 3 in result.quality.low_text_pages
        assert result.quality.extraction_success is True

    def test_detect_scanned_image_only_pdf(self, service: PdfExtractionService) -> None:
        scanned_bytes = _build_scanned_pdf(page_count=2)
        result = service.extract_from_bytes(scanned_bytes)

        assert result.page_count == 2
        assert result.total_characters == 0
        assert result.quality.is_scanned is True
        assert result.quality.ocr_required is True
        assert result.quality.extraction_success is False
        assert "OCR is required" in (result.quality.reason or "")

    def test_corrupted_pdf_raises_corrupted_error(self, service: PdfExtractionService) -> None:
        garbage_bytes = b"%PDF-1.4\ncorrupted garbage binary data\n%%EOF"
        with pytest.raises(CorruptedPdfError):
            service.extract_from_bytes(garbage_bytes)

    def test_encrypted_pdf_raises_encrypted_error(self, service: PdfExtractionService) -> None:
        encrypted_bytes = _build_encrypted_pdf("studentpassword")
        with pytest.raises(EncryptedPdfError):
            service.extract_from_bytes(encrypted_bytes)

    def test_empty_bytes_raises_empty_error(self, service: PdfExtractionService) -> None:
        with pytest.raises(EmptyPdfError):
            service.extract_from_bytes(b"")

    def test_exceeding_max_pages_limit_raises_error(self) -> None:
        settings = Settings(max_extraction_pages=2)
        service = PdfExtractionService(settings=settings)
        three_page_pdf = _build_test_pdf(["Page 1 text", "Page 2 text", "Page 3 text"])

        with pytest.raises(ExtractionLimitExceededError) as exc_info:
            service.extract_from_bytes(three_page_pdf)
        assert "exceeds maximum allowed limit of 2" in str(exc_info.value)

    def test_extract_from_file_path(self, service: PdfExtractionService) -> None:
        pdf_bytes = _build_test_pdf(["File path extraction test content."])
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
            tf.write(pdf_bytes)
            tf_path = Path(tf.name)

        try:
            result = service.extract_from_path(tf_path)
            assert result.page_count == 1
            assert "File path extraction" in result.pages[0].text
        finally:
            if tf_path.exists():
                tf_path.unlink()

