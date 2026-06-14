from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.repositories.document_repository import document_repository
from app.services.document_processor import document_processor


@pytest.mark.asyncio
async def test_health_endpoint(client_override: AsyncSession) -> None:
    """Ensures health diagnostic API is online and accurately reports components status."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["components"]["database"]["status"] == "connected"
    assert data["components"]["database"]["documents_count"] == 0
    assert data["components"]["faiss_index"]["status"] == "initialized"
    assert data["components"]["ollama"]["status"] == "connected"


@pytest.mark.asyncio
async def test_visit_and_search_flow(client_override: AsyncSession) -> None:
    """Executes a full integration pipeline check: visit ingestion, list, single fetch, search, and delete."""
    test_url = "https://example.com/mindcache-demo"
    mock_html = """
    <html>
    <head><title>MindCache Demo Webpage</title></head>
    <body>
    <p>MindCache is an AI-powered personal browser memory system. It runs completely locally.</p>
    </body>
    </html>
    """
    transport = httpx.ASGITransport(app=app)

    # 1. Ingestion: POST /visit
    # Mock download_page to avoid downloading from real internet
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    visit_data = response.json()
    assert visit_data["status"] == "success"
    doc_id = visit_data["document_id"]
    assert doc_id is not None
    assert visit_data["title"] == "MindCache Demo Webpage"
    assert visit_data["domain"] == "example.com"

    # 2. Duplicate Check: POST /visit with same URL should record new visit but not re-index
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    dup_data = response.json()
    assert dup_data["status"] == "duplicate"
    assert dup_data["document_id"] == doc_id

    # 3. List Documents: GET /documents
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/documents")

    assert response.status_code == 200
    docs_list = response.json()
    assert len(docs_list) >= 1
    assert docs_list[0]["id"] == doc_id
    assert len(docs_list[0]["visit_history"]) == 2  # Original + Duplicate visit record

    # 4. Fetch Details: GET /documents/{id}
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get(f"/documents/{doc_id}")

    assert response.status_code == 200
    details = response.json()
    assert details["url"] == test_url
    assert "MindCache is an AI-powered personal browser memory" in details["extracted_content"]
    assert len(details["keywords"]) == 3  # Based on our mock conftest keyword listing

    # 5. Semantic Search: POST /search
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/search",
            json={"query": "local browser memory", "limit": 3, "generate_summary": True},
        )

    assert response.status_code == 200
    search_data = response.json()
    assert search_data["query"] == "local browser memory"
    assert len(search_data["results"]) == 1
    assert search_data["results"][0]["id"] == doc_id
    assert search_data["ai_summary"] == "Mocked collective AI synthesis."

    # 6. Delete Document: DELETE /documents/{id}
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.delete(f"/documents/{doc_id}")

    assert response.status_code == 200
    delete_data = response.json()
    assert "successfully deleted" in delete_data["message"].lower()

    # 7. Confirm Deleted: GET /documents/{id} should return 404
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get(f"/documents/{doc_id}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_visit_with_custom_title(client_override: AsyncSession) -> None:
    """Ensures that the API preserves and falls back to a custom pre-rendered title if the page does not have one."""
    test_url = "https://example.com/no-title-page"
    mock_html = """
    <html>
    <body>
    <p>This is a page with no title tag.</p>
    </body>
    </html>
    """
    transport = httpx.ASGITransport(app=app)

    # Ingestion: POST /visit with custom title
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": test_url, "title": "My Custom Title"})

    assert response.status_code == 201
    visit_data = response.json()
    assert visit_data["status"] == "success"
    doc_id = visit_data["document_id"]
    assert doc_id is not None
    assert visit_data["title"] == "My Custom Title"


@pytest.mark.asyncio
async def test_search_with_time_filtering(client_override: AsyncSession) -> None:
    """Ensures that semantic search results can be filtered using start_time and end_time windows."""
    test_url = "https://example.com/time-search"
    mock_html = """
    <html>
    <head><title>Time Search Page</title></head>
    <body>
    <p>This page tests filtering search results by visit timestamps.</p>
    </body>
    </html>
    """
    transport = httpx.ASGITransport(app=app)

    # 1. Ingest page
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": test_url})
    
    assert response.status_code == 201
    doc_id = response.json()["document_id"]

    # 2. Search with window containing current time (should return results)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/search",
            json={
                "query": "visit timestamps",
                "limit": 3,
                "start_time": "2026-01-01T00:00:00",
                "end_time": "2026-12-31T23:59:59",
            },
        )
    assert response.status_code == 200
    search_data = response.json()
    assert len(search_data["results"]) == 1
    assert search_data["results"][0]["id"] == doc_id

    # 3. Search with start_time in the future (should return no results)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/search",
            json={
                "query": "visit timestamps",
                "limit": 3,
                "start_time": "2027-01-01T00:00:00",
            },
        )
    assert response.status_code == 200
    search_data = response.json()
    assert len(search_data["results"]) == 0
    assert "no matching documents" in search_data["ai_summary"].lower()

    # 4. Search with end_time in the past (should return no results)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/search",
            json={
                "query": "visit timestamps",
                "limit": 3,
                "end_time": "2025-12-31T23:59:59",
            },
        )
    assert response.status_code == 200
    search_data = response.json()
    assert len(search_data["results"]) == 0
    assert "no matching documents" in search_data["ai_summary"].lower()


@pytest.mark.asyncio
async def test_visit_noise_skipping(client_override: AsyncSession) -> None:
    """Verifies that short pages are still indexed (no content skipping)."""
    test_url = "https://example.com/noise-test"
    mock_html = """
    <html>
    <head><title>Short Page</title></head>
    <body>
    <p>Too short.</p>
    </body>
    </html>
    """
    transport = httpx.ASGITransport(app=app)

    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["document_id"] is not None


@pytest.mark.asyncio
async def test_visit_platform_search_skipping(client_override: AsyncSession) -> None:
    """Verifies that all pages including search results are indexed (no search page skipping)."""
    transport = httpx.ASGITransport(app=app)
    mock_html = "<html><head><title>Google Search</title></head><body>Search Results for rust pdf parser. Rust is great.</body></html>"

    # All pages should be indexed regardless of being a search page
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, "https://www.google.com/search?q=rust+pdf+parser"))):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": "https://www.google.com/search?q=rust+pdf+parser", "dwell_time": 5.0})
        assert response.status_code == 201
        assert response.json()["status"] == "success"


@pytest.mark.asyncio
async def test_visit_all_urls_indexed(client_override: AsyncSession) -> None:
    """Verifies that all URL paths are indexed regardless of path or dwell time (no skip logic)."""
    transport = httpx.ASGITransport(app=app)
    mock_html = "<html><head><title>Sample Document</title></head><body>This is a sample document content.</body></html>"

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # Previously blacklisted paths like /login are now indexed
        with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, "https://example.com/login"))):
            response = await ac.post("/visit", json={"url": "https://example.com/login"})
            assert response.status_code == 201
            assert response.json()["status"] == "success"

        # Pages with any dwell time are indexed
        with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, "https://example.com/low-dwell"))):
            response = await ac.post("/visit", json={"url": "https://example.com/low-dwell", "dwell_time": 2.0})
            assert response.status_code == 201
            assert response.json()["status"] == "success"


@pytest.mark.asyncio
async def test_search_click_analytics(client_override: AsyncSession) -> None:
    """Verifies that search clicks are recorded and retrieved successfully to boost ranks."""
    transport = httpx.ASGITransport(app=app)

    # Ingest a mock page to get a document ID
    test_url = "https://example.com/click-test-page"
    mock_html = """
    <html>
    <head><title>Click Target Page</title></head>
    <body>
    <p>This is a page that we will click on from the search results list to train our ranker.</p>
    </body>
    </html>
    """
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    doc_id = response.json()["document_id"]

    # Record a search click
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        click_response = await ac.post("/search/click", json={"query": "ranker training", "document_id": doc_id})

    assert click_response.status_code == 200
    assert click_response.json()["status"] == "success"

    # Retrieve clicks to verify it was stored
    clicks = await document_repository.get_clicks_for_query(client_override, "ranker training")
    assert len(clicks) == 1
    assert clicks[0].document_id == doc_id


@pytest.mark.asyncio
async def test_search_evaluation_dataset(client_override: AsyncSession) -> None:
    """Validates that search queries return the expected documents from the evaluation dataset."""
    import json
    from pathlib import Path

    # 1. Load evaluation dataset
    dataset_path = Path(__file__).parent / "search_evaluation.json"
    with open(dataset_path, "r") as f:
        evaluation_items = json.load(f)

    transport = httpx.ASGITransport(app=app)

    # 2. Ingest the expected documents
    doc_ids = {}
    for item in evaluation_items:
        title = item["expected_title"]
        url = f"https://example.com/{title.lower().replace(' ', '-')}"
        mock_html = f"""
        <html>
        <head><title>{title}</title></head>
        <body>
        <p>This is a page about {title}. It covers topics related to {item['query']}.</p>
        </body>
        </html>
        """

        with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, url))):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
                response = await ac.post("/visit", json={"url": url})
        assert response.status_code == 201
        doc_ids[title] = response.json()["document_id"]

    # 3. Execute searches and verify expected doc ranks #1
    for item in evaluation_items:
        query = item["query"]
        expected_title = item["expected_title"]

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/search", json={"query": query, "limit": 3})

        assert response.status_code == 200
        results = response.json()["results"]

        print(f"\nQUERY: {query} (Expected: {expected_title})")
        for idx, res in enumerate(results):
            print(f"  #{idx+1}: {res['title']} (Score: {res['score']})")

        assert len(results) > 0, f"Query '{query}' returned no results"

        # The expected document should be the top 1 result
        top_title = results[0]["title"]
        assert top_title == expected_title, f"Query '{query}' failed. Expected top result '{expected_title}' but got '{top_title}'"
