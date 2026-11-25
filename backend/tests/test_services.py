from datetime import datetime

import numpy as np
import pytest

from app.core.exceptions import InvalidURLError
from app.services.bm25_service import bm25_service
from app.services.document_processor import document_processor
from app.services.keyword_extractor import keyword_extractor
from app.services.vector_service import vector_service


def test_beautifulsoup_fallback_extraction():
    html = """
    <html>
        <head><title>Test Webpage</title></head>
        <body>
            <style>.header { color: red; }</style>
            <script>console.log("hello");</script>
            <noscript>Unsupported script</noscript>
            <h1>Welcome to MindCache</h1>
            <p>This is a paragraph with <strong>clean text</strong> extraction.</p>
        </body>
    </html>
    """
    text, title = document_processor._fallback_extract(html)
    assert "Welcome to MindCache" in text
    assert "clean text" in text
    assert "hello" not in text
    assert "Unsupported script" not in text
    assert title == "Test Webpage"


def test_iso_date_parsing():
    assert document_processor._parse_date("2026-05-30") == datetime(2026, 5, 30, 0, 0)
    assert document_processor._parse_date("2026-05-30T13:22:37") == datetime(2026, 5, 30, 13, 22, 37)
    assert document_processor._parse_date("invalid-date") is None


def test_validate_and_parse_url():
    assert document_processor._validate_and_parse_url("https://example.com/foo") == "example.com"
    assert document_processor._validate_and_parse_url("http://google.co.in/search?q=1") == "google.co.in"
    with pytest.raises(InvalidURLError):
        document_processor._validate_and_parse_url("not-a-valid-url")
    with pytest.raises(InvalidURLError):
        document_processor._validate_and_parse_url("ftp://server.com")


@pytest.mark.asyncio
async def test_keyword_extractor_extract():
    kws = await keyword_extractor.extract_keywords("This is some sample text for extracting browser keywords.", top_n=3)
    assert len(kws) == 3
    assert kws[0][0] == "test"
    assert kws[0][1] == 0.95


def test_vector_service_add_and_remove():
    mock_vector = np.zeros(384, dtype=np.float32)
    mock_vector[0] = 1.0

    vector_service.add_document(999, mock_vector)
    res = vector_service.search_similar(mock_vector, limit=1)
    assert len(res) >= 1
    assert res[0][0] == 999

    vector_service.delete_document(999)
    res_after = vector_service.search_similar(mock_vector, limit=1)
    if res_after:
        assert res_after[0][0] != 999


def test_bm25_service_tokenization_and_search():
    from app.services.bm25_service import BM25Service
    local_bm25 = BM25Service()

    tokens = local_bm25._tokenize("This is a test of stop-slop, and trafilatura.")
    assert "stop-slop" in tokens
    assert "trafilatura" in tokens
    assert "is" in tokens

    local_bm25.add_document(123, "stop-slop", "Let's stop AI slop in the browser.", ["ai", "slop"])
    local_bm25.add_document(124, "unrelated one", "This is some completely different text.", ["different"])
    local_bm25.add_document(125, "unrelated two", "Another piece of writing that has nothing in common.", ["nothing"])

    results = local_bm25.search("stop-slop", limit=1)
    assert len(results) >= 1
    assert results[0][0] == 123


def test_calculate_document_quality_score():
    from app.services.document_processor import document_processor

    score1 = document_processor.calculate_document_quality_score(
        word_count=50,
        source_type="Generic",
        dwell_time=5.0,
        platform_metadata=None,
        revisit_count=1
    )
    assert score1 == 0.0

    score2 = document_processor.calculate_document_quality_score(
        word_count=600,
        source_type="Generic",
        dwell_time=12.0,
        platform_metadata=None,
        revisit_count=2
    )
    assert score2 == 3.0

    score3 = document_processor.calculate_document_quality_score(
        word_count=100,
        source_type="Documentation",
        dwell_time=75.0,
        platform_metadata={"transcript_available": True},
        revisit_count=1
    )
    assert score3 == 5.0
