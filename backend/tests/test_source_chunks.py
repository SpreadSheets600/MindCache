from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy import select

from app.main import app
from app.models.document import Document
from app.models.files import Chunk
from app.services import indexer as indexer_module
from app.services.document_processor import document_processor
from app.services.memory_search import search_memory
from app.services.source_chunks import backfill_pages


async def visit(client, url, title, body):
    html = f"<html><head><title>{title}</title></head><body><p>{body}</p></body></html>"
    with patch.object(document_processor, "_download_page", AsyncMock(return_value=(html, url))):
        response = await client.post("/visit", json={"url": url})
    assert response.status_code == 201
    return response.json()["document_id"]


@pytest.mark.asyncio
async def test_captured_pages_appear_in_memory_search(client_override, db_session, stack):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        document_id = await visit(client, "https://example.com/lemurs", "Lemur field guide", "Ring-tailed lemurs live in Madagascar.")
    results = await search_memory(db_session, "lemurs madagascar")
    page = next(item for item in results if item["kind"] == "page")
    assert page["id"] == document_id
    assert page["location"] == "https://example.com/lemurs"
    assert "lemurs" in page["passages"][0]["text"].lower()
    assert stack.count >= 1


@pytest.mark.asyncio
async def test_deleting_a_page_removes_it_from_memory_search(client_override, db_session, stack):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        document_id = await visit(client, "https://example.com/okapi", "Okapi notes", "The okapi is a forest giraffe relative.")
        assert any(item["kind"] == "page" for item in await search_memory(db_session, "okapi"))
        assert (await client.delete(f"/documents/{document_id}")).status_code == 200
    assert not any(item["kind"] == "page" for item in await search_memory(db_session, "okapi"))
    assert (await db_session.execute(select(Chunk).where(Chunk.source_kind == "document"))).scalars().all() == []


@pytest.mark.asyncio
async def test_backfill_indexes_existing_pages_once(db_session, stack):
    db_session.add(
        Document(url="https://example.com/old", domain="example.com", title="Old page", extracted_content="Pangolin scales are keratin.")
    )
    await db_session.commit()
    await backfill_pages()
    assert any(item["kind"] == "page" for item in await search_memory(db_session, "pangolin"))
    calls = indexer_module.embedder.embed_documents.call_count
    await backfill_pages()
    assert indexer_module.embedder.embed_documents.call_count == calls
    pages = len((await db_session.execute(select(Document))).scalars().all())
    await backfill_pages(force=True)
    assert indexer_module.embedder.embed_documents.call_count == calls + pages
    chunked = {chunk.source_id for chunk in (await db_session.execute(select(Chunk).where(Chunk.source_kind == "document"))).scalars()}
    assert len(chunked) == pages


@pytest.mark.asyncio
async def test_notes_are_searchable_and_follow_edits_and_deletes(client_override, db_session, stack):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        created = await client.post("/items", json={"title": "Garden", "content": "Plant the dahlias after the last frost."})
        note_id = created.json()["id"]
        hit = next(item for item in await search_memory(db_session, "dahlias") if item["kind"] == "note")
        assert hit["id"] == note_id
        assert hit["location"] == ""
        edited = await client.put(f"/items/{note_id}", json={"title": "Garden", "content": "Sow the sunflowers in spring."})
        assert edited.status_code == 200
        assert not any(item["kind"] == "note" and item["id"] == note_id for item in await search_memory(db_session, "dahlias"))
        assert any(item["kind"] == "note" and item["id"] == note_id for item in await search_memory(db_session, "sunflowers"))
        assert (await client.delete(f"/items/{note_id}")).status_code == 200
        assert not any(item["kind"] == "note" for item in await search_memory(db_session, "sunflowers"))


@pytest.mark.asyncio
async def test_uploaded_text_files_are_searchable_with_a_download_location(client_override, db_session, stack):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        response = await client.post("/items/upload", files={"file": ("trip.txt", b"Hostel booking for the Lisbon trip, confirmation 4821.", "text/plain")})
        assert response.status_code == 201
        item_id = response.json()["id"]
    hit = next(item for item in await search_memory(db_session, "lisbon confirmation") if item["kind"] == "upload")
    assert hit["id"] == item_id
    assert hit["location"] == f"/items/{item_id}/file"


@pytest.mark.asyncio
async def test_backfill_covers_existing_items(db_session, stack):
    from app.models.item import SavedItem
    from app.services.source_chunks import backfill_items

    db_session.add(SavedItem(kind="note", title="Old note", content="Remember the heron sanctuary visit.", status="ready"))
    await db_session.commit()
    await backfill_items()
    assert any(item["kind"] == "note" for item in await search_memory(db_session, "heron sanctuary"))
