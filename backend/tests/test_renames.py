import os

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.db import session as database
from app.models.files import Chunk, IndexedFile
from app.services import indexer as indexer_module
from app.services.memory_search import search_memory
from tests.test_index_controls import add_folder_with, fresh_indexer


async def index_all(indexer):
    async with database.AsyncSessionLocal() as db:
        ids = (await db.execute(select(IndexedFile.id).where(IndexedFile.status == "pending"))).scalars().all()
    for file_id in ids:
        await indexer.index_file(file_id)


async def only_row():
    async with database.AsyncSessionLocal() as db:
        return (await db.execute(select(IndexedFile))).scalars().one()


async def titles(query):
    async with database.AsyncSessionLocal() as db:
        return [item["title"] for item in await search_memory(db, query)]


@pytest_asyncio.fixture
async def setup(file_db, stack, tmp_path, monkeypatch):
    indexer = await fresh_indexer(monkeypatch)
    root = tmp_path / "docs"
    root.mkdir()
    folder_id = await add_folder_with(root, ["old-name.txt"])
    await indexer.scan_folder(folder_id)
    await index_all(indexer)
    yield indexer, root, folder_id
    await indexer.stop()


@pytest.mark.asyncio
async def test_rename_found_by_scan_keeps_index_without_reembedding(setup):
    indexer, root, folder_id = setup
    before = await only_row()
    calls = indexer_module.embedder.embed_documents.call_count
    os.rename(root / "old-name.txt", root / "new-name.txt")
    await indexer.scan_folder(folder_id)
    after = await only_row()
    assert (after.id, after.name, after.status) == (before.id, "new-name.txt", "indexed")
    assert after.path.endswith("new-name.txt")
    assert indexer_module.embedder.embed_documents.call_count == calls
    assert "new-name.txt" in await titles("lighthouses")
    assert "old-name.txt" not in await titles("old")


@pytest.mark.asyncio
async def test_rename_seen_as_delete_then_create_is_adopted(setup):
    indexer, root, folder_id = setup
    before = await only_row()
    calls = indexer_module.embedder.embed_documents.call_count
    os.rename(root / "old-name.txt", root / "moved.txt")
    await indexer.sync_path(folder_id, str(root / "old-name.txt"))
    assert (await only_row()).status == "missing"
    assert await titles("lighthouses") == []
    await indexer.sync_path(folder_id, str(root / "moved.txt"))
    after = await only_row()
    assert (after.id, after.name, after.status) == (before.id, "moved.txt", "indexed")
    assert indexer_module.embedder.embed_documents.call_count == calls
    assert await titles("lighthouses") == ["moved.txt"]


@pytest.mark.asyncio
async def test_missing_files_are_purged_after_the_grace_period(setup, monkeypatch):
    indexer, root, folder_id = setup
    monkeypatch.setattr(indexer_module, "MISSING_GRACE_SECONDS", 0.0)
    (root / "old-name.txt").unlink()
    await indexer.sync_path(folder_id, str(root / "old-name.txt"))
    await indexer.purge_missing()
    async with database.AsyncSessionLocal() as db:
        assert (await db.execute(select(IndexedFile))).scalars().all() == []
        assert (await db.execute(select(Chunk))).scalars().all() == []
    assert await titles("lighthouses") == []


@pytest.mark.asyncio
async def test_recreated_file_at_the_same_path_is_restored(setup):
    indexer, root, folder_id = setup
    content = (root / "old-name.txt").read_bytes()
    stat = (root / "old-name.txt").stat()
    (root / "old-name.txt").unlink()
    await indexer.sync_path(folder_id, str(root / "old-name.txt"))
    (root / "old-name.txt").write_bytes(content)
    os.utime(root / "old-name.txt", ns=(stat.st_atime_ns, stat.st_mtime_ns))
    await indexer.scan_folder(folder_id)
    await index_all(indexer)
    assert (await only_row()).status == "indexed"
    assert await titles("lighthouses") == ["old-name.txt"]
