from datetime import datetime

import numpy as np
import pytest

from app.core.exceptions import InvalidURLError
from app.services.bm25_service import bm25_service
from app.services.document_processor import document_processor
from app.services.embedding_service import embedding_service
from app.services.keyword_extractor import keyword_extractor
from app.services.ollama_service import ollama_service
from app.services.vector_service import vector_service


def test_beautifulsoup_fallback_extraction():
    """Ensures raw HTML content is cleanly scraped using the BeautifulSoup fallback parser."""
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
    """Checks parsing capabilities of diverse ISO date strings from Trafilatura metadata."""
    assert document_processor._parse_date("2026-05-30") == datetime(2026, 5, 30, 0, 0)
    assert document_processor._parse_date("2026-05-30T13:22:37") == datetime(2026, 5, 30, 13, 22, 37)
    assert document_processor._parse_date("invalid-date") is None


def test_validate_and_parse_url():
    """Validates that a URL is correctly verified and its domain is parsed."""
    assert document_processor._validate_and_parse_url("https://example.com/foo") == "example.com"
    assert document_processor._validate_and_parse_url("http://google.co.in/search?q=1") == "google.co.in"
    with pytest.raises(InvalidURLError):
        document_processor._validate_and_parse_url("not-a-valid-url")
    with pytest.raises(InvalidURLError):
        document_processor._validate_and_parse_url("ftp://server.com")


def test_embedding_service_generation():
    """Ensures embedding service correctly yields mocked semantic embedding vectors."""
    emb = embedding_service.generate_embedding("Semantic browser memory search")
    assert len(emb) == 384
    assert isinstance(emb, np.ndarray)


def test_keyword_extractor_extract():
    """Ensures keywords are successfully extracted from text with scores."""
    kws = keyword_extractor.extract_keywords("This is some sample text for extracting browser keywords.", top_n=3)
    assert len(kws) == 3
    assert kws[0][0] == "test"
    assert kws[0][1] == 0.95


def test_vector_service_add_and_remove():
    """Tests addition, lookup, and deletion of documents inside the FAISS index."""
    mock_vector = np.zeros(384, dtype=np.float32)
    mock_vector[0] = 1.0

    # Add
    vector_service.add_document(999, mock_vector)
    res = vector_service.search_similar(mock_vector, limit=1)
    assert len(res) >= 1
    assert res[0][0] == 999

    # Remove
    vector_service.delete_document(999)
    res_after = vector_service.search_similar(mock_vector, limit=1)
    if res_after:
        assert res_after[0][0] != 999


@pytest.mark.asyncio
async def test_ollama_service_generate_summary():
    """Verifies Ollama service check health and summary generation are functional under mock."""
    assert await ollama_service.check_health() is True
    summary = await ollama_service.generate_summary("Clean trimmed content text")
    assert summary == "Mocked AI summary."


def test_bm25_service_tokenization_and_search():
    """Ensures BM25 correctly tokenizes hyphens/punctuation and retrieves documents."""
    from app.services.bm25_service import BM25Service
    local_bm25 = BM25Service()
    
    tokens = local_bm25._tokenize("This is a test of stop-slop, and trafilatura.")
    assert "stop-slop" in tokens
    assert "trafilatura" in tokens
    assert "is" in tokens

    # Test adding and searching
    local_bm25.add_document(123, "stop-slop", "Let's stop AI slop in the browser.", ["ai", "slop"])
    results = local_bm25.search("stop-slop", limit=1)
    assert len(results) >= 1
    assert results[0][0] == 123
