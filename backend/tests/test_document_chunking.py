"""Unit tests for DocumentChunkingService (Phase 10)."""

from __future__ import annotations

import uuid
import pytest

from app.models.document_extraction import DocumentPage
from app.services.document_chunking_service import DocumentChunkingService


def _make_page(page_number: int, text: str) -> DocumentPage:
    return DocumentPage(
        id=uuid.uuid4(),
        document_id=uuid.uuid4(),
        page_number=page_number,
        text=text,
        character_count=len(text),
        has_text=bool(text.strip()),
    )


class TestDocumentChunkingService:
    def test_empty_pages_returns_empty_list(self) -> None:
        service = DocumentChunkingService()
        assert service.chunk_pages([]) == []

        empty_page = _make_page(1, "   \n\n  ")
        assert service.chunk_pages([empty_page]) == []

    def test_single_page_chunking(self) -> None:
        service = DocumentChunkingService(target_tokens=100, overlap_tokens=20)
        text = (
            "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. "
            "This chemical energy is stored in carbohydrate molecules, such as sugars and starches. "
            "Photosynthesis is largely responsible for producing and maintaining the oxygen content of the Earth's atmosphere."
        )
        page = _make_page(1, text)
        chunks = service.chunk_pages([page])

        assert len(chunks) >= 1
        assert chunks[0].chunk_index == 0
        assert chunks[0].page_start == 1
        assert chunks[0].page_end == 1
        assert chunks[0].page_numbers == [1]
        assert "Photosynthesis" in chunks[0].text
        assert chunks[0].token_count > 0
        assert len(chunks[0].content_hash) == 64

    def test_multipage_chunking_provenance(self) -> None:
        service = DocumentChunkingService(target_tokens=40, overlap_tokens=10)
        page1 = _make_page(1, "Chapter 1: The Cell. Cells are the basic structural and functional units of all living organisms.")
        page2 = _make_page(2, "Mitochondria are known as the powerhouses of the cell. They generate most of the chemical energy needed.")
        page3 = _make_page(3, "Ribosomes perform protein synthesis, translating genetic codes from mRNA into amino acid sequences.")

        chunks = service.chunk_pages([page1, page2, page3])
        assert len(chunks) >= 2

        # Verify chunk indices are sequential
        for idx, chunk in enumerate(chunks):
            assert chunk.chunk_index == idx
            assert chunk.page_start <= chunk.page_end
            assert all(p in [1, 2, 3] for p in chunk.page_numbers)

    def test_long_paragraph_splits_at_sentence_boundaries(self) -> None:
        service = DocumentChunkingService(target_tokens=50, overlap_tokens=10, max_chunk_tokens=70)
        long_para = (
            "Sentence one is the introductory statement about cell biology. "
            "Sentence two discusses the discovery of cells by Robert Hooke in 1665. "
            "Sentence three explains the modern cell theory proposed by Schleiden and Schwann. "
            "Sentence four elaborates that all living organisms are composed of one or more cells. "
            "Sentence five mentions that all cells arise from pre-existing cells through cell division."
        )
        page = _make_page(4, long_para)
        chunks = service.chunk_pages([page])

        assert len(chunks) > 1
        for chunk in chunks:
            assert chunk.page_start == 4
            assert chunk.page_end == 4
            # Sentences should be intact
            assert chunk.text.endswith(".") or chunk.text.endswith("division.")

    def test_chunk_hash_stability(self) -> None:
        service = DocumentChunkingService(target_tokens=100)
        text = "Universal Gravitation states that every particle attracts every other particle with a force proportional to the product of their masses."
        page = _make_page(5, text)

        run1 = service.chunk_pages([page])
        run2 = service.chunk_pages([page])

        assert len(run1) == len(run2) == 1
        assert run1[0].content_hash == run2[0].content_hash
        assert run1[0].text == run2[0].text

    def test_hindi_sentence_boundary_support(self) -> None:
        service = DocumentChunkingService(target_tokens=30, overlap_tokens=5, max_chunk_tokens=40)
        hindi_text = (
            "प्रकाश संश्लेषण पौधों में भोजन बनाने की प्रक्रिया है। "
            "यह क्लोरोफिल और सूर्य के प्रकाश की उपस्थिति में होता है। "
            "इस प्रक्रिया में ऑक्सीजन गैस बाहर निकलती है।"
        )
        page = _make_page(10, hindi_text)
        chunks = service.chunk_pages([page])

        assert len(chunks) >= 1
        assert any("प्रकाश संश्लेषण" in c.text for c in chunks)
        assert chunks[0].page_numbers == [10]

