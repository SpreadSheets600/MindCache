import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy import select

from app.main import app
from app.models.files import Chunk, IndexedFile, WatchedFolder
from app.services import file_search, indexer as indexer_module
from app.services.file_search import search_files


async def index_pending(db):
    ids = (await db.execute(select(IndexedFile.id).where(IndexedFile.status == "pending"))).scalars().all()
    indexer = indexer_module.indexer
    for file_id in ids:
        await indexer.index_file(file_id)
    return ids


async def add_folder(db, path):
    folder = WatchedFolder(path=str(path))
    db.add(folder)
    await db.commit()
    return folder.id


async def scan_and_index(db, folder_id):
    await indexer_module.indexer.scan_folder(folder_id)
    indexer_module.indexer.queued.clear()
    while not indexer_module.indexer.queue.empty():
        indexer_module.indexer.queue.get_nowait()
    db.expire_all()
    await index_pending(db)
    db.expire_all()


@pytest.mark.asyncio
async def test_new_files_become_searchable(db_session, stack, tmp_path):
    (tmp_path / "notes").mkdir()
    (tmp_path / "notes" / "cells.md").write_text("The mitochondria produces energy inside the cell.")
    (tmp_path / "notes" / "shop.txt").write_text("Buy milk and bread.")
    (tmp_path / ".env").write_text("SECRET=1")
    folder_id = await add_folder(db_session, tmp_path)
    await scan_and_index(db_session, folder_id)
    files = (await db_session.execute(select(IndexedFile))).scalars().all()
    assert sorted(file.name for file in files) == ["cells.md", "shop.txt"]
    assert all(file.status == "indexed" and file.chunk_count == 1 for file in files)
    results = await search_files(db_session, "mitochondria")
    assert results[0]["name"] == "cells.md"
    assert stack.count == 2


@pytest.mark.asyncio
async def test_changed_file_replaces_its_old_content(db_session, stack, tmp_path):
    target = tmp_path / "a.txt"
    target.write_text("Original zebra text.")
    folder_id = await add_folder(db_session, tmp_path)
    await scan_and_index(db_session, folder_id)
    target.write_text("Replacement giraffe text, now longer.")
    await scan_and_index(db_session, folder_id)
    stale = await search_files(db_session, "zebra")
    assert not any("zebra" in passage["text"] for result in stale for passage in result["passages"])
    assert (await search_files(db_session, "giraffe"))[0]["name"] == "a.txt"
    assert stack.count == 1


@pytest.mark.asyncio
async def test_touched_but_unchanged_file_is_not_reembedded(db_session, stack, tmp_path):
    target = tmp_path / "a.txt"
    target.write_text("Stable content here.")
    folder_id = await add_folder(db_session, tmp_path)
    await scan_and_index(db_session, folder_id)
    calls = indexer_module.embedder.embed_documents.call_count
    stat = target.stat()
    os.utime(target, ns=(stat.st_atime_ns, stat.st_mtime_ns + 5_000_000_000))
    await scan_and_index(db_session, folder_id)
    assert indexer_module.embedder.embed_documents.call_count == calls
    assert (await db_session.execute(select(IndexedFile))).scalars().one().status == "indexed"


@pytest.mark.asyncio
async def test_deleted_file_disappears_from_search_and_vectors(db_session, stack, tmp_path):
    target = tmp_path / "gone.txt"
    target.write_text("Unique platypus sentence.")
    (tmp_path / "stay.txt").write_text("Another file that remains.")
    folder_id = await add_folder(db_session, tmp_path)
    await scan_and_index(db_session, folder_id)
    target.unlink()
    await scan_and_index(db_session, folder_id)
    assert all(result["name"] != "gone.txt" for result in await search_files(db_session, "platypus"))
    assert [file.name for file in (await db_session.execute(select(IndexedFile))).scalars()] == ["stay.txt"]
    assert stack.count == 1
    assert len((await db_session.execute(select(Chunk))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_embedding_failure_keeps_keyword_search(db_session, stack, tmp_path):
    (tmp_path / "a.txt").write_text("Quarterly cedar budget review.")
    folder_id = await add_folder(db_session, tmp_path)
    with patch.object(indexer_module.embedder, "embed_documents", side_effect=RuntimeError("no model")):
        await scan_and_index(db_session, folder_id)
    row = (await db_session.execute(select(IndexedFile))).scalars().one()
    assert row.status == "partial"
    assert "Semantic search unavailable" in row.error
    assert (await search_files(db_session, "cedar"))[0]["name"] == "a.txt"


@pytest.mark.asyncio
async def test_binary_and_blank_files_are_skipped_with_a_reason(db_session, stack, tmp_path):
    (tmp_path / "blob.txt").write_bytes(b"abc\x00\x01\x02" * 50)
    (tmp_path / "blank.md").write_text("   \n  ")
    folder_id = await add_folder(db_session, tmp_path)
    await scan_and_index(db_session, folder_id)
    rows = (await db_session.execute(select(IndexedFile))).scalars().all()
    assert {row.status for row in rows} == {"skipped"}
    assert all(row.error for row in rows)


@pytest.mark.asyncio
async def test_forgetting_a_folder_removes_its_index_but_not_its_files(db_session, stack, tmp_path):
    target = tmp_path / "keep.txt"
    target.write_text("Remember the walrus.")
    folder_id = await add_folder(db_session, tmp_path)
    await scan_and_index(db_session, folder_id)
    await indexer_module.indexer.forget_folder(db_session, await db_session.get(WatchedFolder, folder_id))
    assert target.exists()
    assert stack.count == 0
    assert (await db_session.execute(select(Chunk))).scalars().all() == []
    assert await search_files(db_session, "walrus") == []


@pytest.mark.asyncio
async def test_folder_api_validates_and_lists(client_override, stack, tmp_path):
    root = tmp_path / "docs"
    root.mkdir()
    transport = httpx.ASGITransport(app=app)
    with patch.object(indexer_module.indexer, "scan_folder_later", AsyncMock()):
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
            assert (await client.post("/folders", json={"path": "relative/dir"})).status_code == 400
            assert (await client.post("/folders", json={"path": str(tmp_path / "missing")})).status_code == 400
            assert (await client.post("/folders", json={"path": "/"})).status_code == 400
            created = await client.post("/folders", json={"path": str(root), "exclude_globs": ["*.tmp", " "]})
            assert created.status_code == 201
            assert created.json()["exclude_globs"] == ["*.tmp"]
            assert (await client.post("/folders", json={"path": str(root)})).status_code == 409
            nested = root / "inner"
            nested.mkdir()
            assert (await client.post("/folders", json={"path": str(nested)})).status_code == 409
            assert [item["path"] for item in (await client.get("/folders")).json()] == [str(root.resolve())]
            assert (await client.delete(f"/folders/{created.json()['id']}")).status_code == 200
            assert (await client.get("/folders")).json() == []
            assert (await client.get("/index/status")).json()["embedding"] in {"ready", "not_downloaded"}


@pytest.mark.asyncio
async def test_extension_origin_cannot_manage_folders(client_override):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        response = await client.get("/folders", headers={"origin": "chrome-extension://" + "a" * 32})
    assert response.status_code == 403
