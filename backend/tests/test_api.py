from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
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
    assert data["components"]["database"] == "connected"
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
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=mock_html)):
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
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=mock_html)):
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
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=mock_html)):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post("/visit", json={"url": test_url})
    
    assert response.status_code == 201
    doc_id = response.json()["document_id"]

    # 2. Search with window containing current time (should return results)
    from app.services.reranker_service import reranker_service
    with patch.object(reranker_service, "rerank", return_value=[(doc_id, 0.95)]):
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
