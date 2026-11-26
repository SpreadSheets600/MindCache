from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.repositories.document_repository import document_repository
from app.services.document_processor import document_processor


@pytest.mark.asyncio
async def test_health_endpoint(client_override: AsyncSession):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["components"]["database"]["status"] == "connected"
    assert data["components"]["database"]["documents_count"] == 0
    assert data["components"]["faiss_index"]["status"] == "initialized"
    assert data["components"]["embedding"]["status"] == "ready"
    assert data["components"]["embedding"]["model"] == "google/embeddinggemma-2"


@pytest.mark.asyncio
async def test_visit_and_search_flow(client_override: AsyncSession):
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

    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    visit_data = response.json()
    assert visit_data["status"] == "success"
    doc_id = visit_data["document_id"]
    assert doc_id is not None
    assert visit_data["title"] == "MindCache Demo Webpage"
    assert visit_data["domain"] == "example.com"

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    dup_data = response.json()
    assert dup_data["status"] == "duplicate"
    assert dup_data["document_id"] == doc_id

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.get("/documents")

    assert response.status_code == 200
    docs_list = response.json()
    assert len(docs_list) >= 1
    assert docs_list[0]["id"] == doc_id
    assert len(docs_list[0]["visit_history"]) == 2

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.get(f"/documents/{doc_id}")

    assert response.status_code == 200
    details = response.json()
    assert details["url"] == test_url
    assert "MindCache is an AI-powered personal browser memory" in details["extracted_content"]
    assert len(details["keywords"]) == 3

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.post(
            "/search",
            json={"query": "local browser memory", "limit": 3, "generate_summary": True},
        )

    assert response.status_code == 200
    search_data = response.json()
    assert search_data["query"] == "local browser memory"
    assert len(search_data["results"]) == 1
    assert search_data["results"][0]["id"] == doc_id
    assert "semantic" in search_data["results"][0]["match_reasons"]
    assert search_data["ai_summary"] is None

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.delete(f"/documents/{doc_id}")

    assert response.status_code == 200
    delete_data = response.json()
    assert "successfully deleted" in delete_data["message"].lower()

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        response = await ac.get(f"/documents/{doc_id}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_visit_with_custom_title(client_override: AsyncSession):
    test_url = "https://example.com/no-title-page"
    mock_html = """
    <html>
    <body>
    <p>This is a page with no title tag.</p>
    </body>
    </html>
    """
    transport = httpx.ASGITransport(app=app)

    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/visit", json={"url": test_url, "title": "My Custom Title"})

    assert response.status_code == 201
    visit_data = response.json()
    assert visit_data["status"] == "success"
    doc_id = visit_data["document_id"]
    assert doc_id is not None
    assert visit_data["title"] == "My Custom Title"


@pytest.mark.asyncio
async def test_search_uses_lexical_index_when_embedding_fails(client_override: AsyncSession):
    from app.services.embedder import embedder

    url = "https://example.com/lexical-fallback"
    html = "<html><head><title>Quantum cedar</title></head><body>Quantum cedar research notes.</body></html>"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        with patch.object(document_processor, "_download_page", AsyncMock(return_value=(html, url))):
            visit = await ac.post("/visit", json={"url": url})
        assert visit.status_code == 201
        with patch.object(embedder, "embed_query", side_effect=RuntimeError("model unavailable")):
            response = await ac.post("/search", json={"query": "quantum cedar"})

    assert response.status_code == 200
    results = response.json()["results"]
    assert any(item["id"] == visit.json()["document_id"] and "title" in item["match_reasons"] for item in results)
    assert all("semantic" not in item["match_reasons"] for item in results)


@pytest.mark.asyncio
async def test_search_with_time_filtering(client_override: AsyncSession):
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

    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, test_url))):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    doc_id = response.json()["document_id"]

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
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

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
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

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
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
async def test_visit_noise_skipping(client_override: AsyncSession):
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
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["document_id"] is not None


@pytest.mark.asyncio
async def test_visit_platform_search_skipping(client_override: AsyncSession):
    transport = httpx.ASGITransport(app=app)
    mock_html = "<html><head><title>Google Search</title></head><body>Search Results for rust pdf parser. Rust is great.</body></html>"

    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, "https://www.google.com/search?q=rust+pdf+parser"))):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/visit", json={"url": "https://www.google.com/search?q=rust+pdf+parser", "dwell_time": 5.0})
        assert response.status_code == 201
        assert response.json()["status"] == "success"


@pytest.mark.asyncio
async def test_visit_all_urls_indexed(client_override: AsyncSession):
    transport = httpx.ASGITransport(app=app)
    mock_html = "<html><head><title>Sample Document</title></head><body>This is a sample document content.</body></html>"

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, "https://example.com/login"))):
            response = await ac.post("/visit", json={"url": "https://example.com/login"})
            assert response.status_code == 201
            assert response.json()["status"] == "success"

        with patch.object(document_processor, "_download_page", AsyncMock(return_value=(mock_html, "https://example.com/low-dwell"))):
            response = await ac.post("/visit", json={"url": "https://example.com/low-dwell", "dwell_time": 2.0})
            assert response.status_code == 201
            assert response.json()["status"] == "success"


@pytest.mark.asyncio
async def test_search_click_analytics(client_override: AsyncSession):
    transport = httpx.ASGITransport(app=app)

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
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/visit", json={"url": test_url})

    assert response.status_code == 201
    doc_id = response.json()["document_id"]

    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        click_response = await ac.post("/search/click", json={"query": "ranker training", "document_id": doc_id})

    assert click_response.status_code == 200
    assert click_response.json()["status"] == "success"

    clicks = await document_repository.get_clicks_for_query(client_override, "ranker training")
    assert len(clicks) == 1
    assert clicks[0].document_id == doc_id


@pytest.mark.asyncio
async def test_search_evaluation_dataset(client_override: AsyncSession):
    import json
    from pathlib import Path

    dataset_path = Path(__file__).parent / "search_evaluation.json"
    with open(dataset_path) as f:
        evaluation_items = json.load(f)

    transport = httpx.ASGITransport(app=app)

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
            async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
                response = await ac.post("/visit", json={"url": url})
        assert response.status_code == 201
        doc_ids[title] = response.json()["document_id"]

    for item in evaluation_items:
        query = item["query"]
        expected_title = item["expected_title"]

        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
            response = await ac.post("/search", json={"query": query, "limit": 3})

        assert response.status_code == 200
        results = response.json()["results"]

        print(f"\nQUERY: {query} (Expected: {expected_title})")
        for idx, res in enumerate(results):
            print(f"  #{idx+1}: {res['title']} (Score: {res['score']})")

        assert len(results) > 0, f"Query '{query}' returned no results"

        top_title = results[0]["title"]
        assert top_title == expected_title, f"Query '{query}' failed. Expected top result '{expected_title}' but got '{top_title}'"


@pytest.mark.asyncio
async def test_privacy_controls_stop_history_and_clear_existing(client_override: AsyncSession):
    from sqlalchemy import func, select
    from app.models.document import SearchClick, SearchQuery

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        await ac.post("/search", json={"query": "before privacy change"})
        settings = await ac.put("/privacy", json={"save_search_history": False, "learn_from_clicks": False})
        assert settings.status_code == 200
        assert (await ac.post("/search/click", json={"query": "private", "document_id": 1})).json()["status"] == "disabled"
        before = (await client_override.execute(select(func.count()).select_from(SearchQuery))).scalar_one()
        await ac.post("/search", json={"query": "private search"})
        assert (await client_override.execute(select(func.count()).select_from(SearchQuery))).scalar_one() == before
        assert (await ac.delete("/privacy/history")).status_code == 200
        assert (await client_override.execute(select(func.count()).select_from(SearchQuery))).scalar_one() == 0
        assert (await client_override.execute(select(func.count()).select_from(SearchClick))).scalar_one() == 0
        await ac.put("/privacy", json={"save_search_history": True, "learn_from_clicks": True})


@pytest.mark.asyncio
async def test_browser_origin_and_host_restrictions(client_override: AsyncSession):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as ac:
        assert (await ac.get("/health", headers={"Origin": "https://evil.example"})).status_code == 403
        assert (await ac.get("/health", headers={"Host": "localhost.evil.example"})).status_code == 403


@pytest.mark.asyncio
async def test_extension_must_be_paired(tmp_path):
    from app.api import pairing
    identifier = "abcdefghijklmnop" * 2
    transport = httpx.ASGITransport(app=app)
    with patch.object(pairing, "PAIRING_PATH", tmp_path / "extensions.json"):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
            origin = {"Origin": f"chrome-extension://{identifier}"}
            assert (await client.get("/", headers=origin)).status_code == 403
            assert (await client.post("/pairing", json={"extension_id": identifier})).status_code == 200
            assert (await client.get("/", headers=origin)).status_code == 200
            assert (await client.get("/pairing", headers=origin)).status_code == 403
            assert (await client.delete(f"/pairing/{identifier}")).status_code == 200
            assert (await client.get("/", headers=origin)).status_code == 403


@pytest.mark.asyncio
async def test_bundled_extension_connects_without_pairing(tmp_path, client_override):
    import base64
    import hashlib
    import json
    from pathlib import Path
    from app.api import pairing
    from app.core.pairing import MINDCACHE_EXTENSION_ID

    manifest = json.loads((Path(__file__).resolve().parents[2] / "extension/public/manifest.json").read_text())
    digest = hashlib.sha256(base64.b64decode(manifest["key"])).hexdigest()[:32]
    identifier = "".join(chr(ord("a") + int(character, 16)) for character in digest)
    assert identifier == MINDCACHE_EXTENSION_ID
    transport = httpx.ASGITransport(app=app)
    with patch.object(pairing, "PAIRING_PATH", tmp_path / "extensions.json"):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
            origin = {"Origin": f"chrome-extension://{identifier}"}
            assert (await client.get("/", headers=origin)).status_code == 200
            assert (await client.get("/documents", headers=origin)).status_code == 200
            assert (await client.get("/folders", headers=origin)).status_code == 403
