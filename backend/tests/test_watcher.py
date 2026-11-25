import asyncio
import os
import shutil

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.db import session as database
from app.models.files import IndexedFile, WatchedFolder
from app.services import indexer as indexer_module
from app.services import watcher as watcher_module
from app.services.memory_search import search_memory
from app.services.watcher import Watcher


async def eventually(check, timeout=10.0):
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if await check():
            return True
        await asyncio.sleep(0.1)
    return False


async def rows():
    async with database.AsyncSessionLocal() as db:
        return {row.name: row for row in (await db.execute(select(IndexedFile))).scalars()}


async def found(query, name):
    async with database.AsyncSessionLocal() as db:
        return any(item["title"] == name and "keyword" in item["reasons"] for item in await search_memory(db, query))


@pytest_asyncio.fixture
async def live(file_db, stack, tmp_path, monkeypatch):
    monkeypatch.setattr(watcher_module, "DEBOUNCE_SECONDS", 0.2)

    async def idle(self):
        await asyncio.sleep(3600)

    monkeypatch.setattr(Watcher, "reconcile_forever", idle)
    root = tmp_path / "watched"
    root.mkdir()
    async with database.AsyncSessionLocal() as db:
        folder = WatchedFolder(path=str(root))
        db.add(folder)
        await db.commit()
        folder_id = folder.id
    monkeypatch.setattr(indexer_module.indexer, "lock", asyncio.Lock())
    monkeypatch.setattr(indexer_module.indexer, "queue", asyncio.Queue())
    monkeypatch.setattr(indexer_module.indexer, "queued", set())
    monkeypatch.setattr(indexer_module.indexer, "running", asyncio.Event())
    indexer_module.indexer.running.set()
    indexer_module.indexer.start()
    watcher = Watcher()
    await watcher.start()
    yield root, folder_id
    await watcher.stop()
    await indexer_module.indexer.stop()
    indexer_module.indexer.worker = None


@pytest.mark.asyncio
async def test_new_edited_and_deleted_files_are_followed(live):
    root, _ = live
    target = root / "idea.md"
    target.write_text("Notes about the walrus colony.")
    assert await eventually(lambda: found("walrus", "idea.md"))
    target.write_text("Notes about the penguin colony, rewritten completely.")
    assert await eventually(lambda: found("penguin", "idea.md"))
    assert not await found("walrus", "idea.md")
    target.unlink()

    async def gone():
        return "idea.md" not in await rows()

    assert await eventually(gone)
    assert not await found("penguin", "idea.md")


@pytest.mark.asyncio
async def test_files_in_new_subfolders_are_picked_up(live):
    root, _ = live
    (root / "projects" / "alpha").mkdir(parents=True)
    await asyncio.sleep(0.5)
    (root / "projects" / "alpha" / "plan.txt").write_text("Roadmap for the aardvark initiative.")
    assert await eventually(lambda: found("aardvark", "plan.txt"))


@pytest.mark.asyncio
async def test_excluded_files_are_never_indexed(live):
    root, _ = live
    (root / "node_modules").mkdir()
    (root / "node_modules" / "dep.txt").write_text("vendor text lemur")
    (root / ".env").write_text("TOKEN=lemur")
    (root / "visible.txt").write_text("Visible lemur text.")
    assert await eventually(lambda: found("lemur", "visible.txt"))
    assert sorted(await rows()) == ["visible.txt"]


@pytest.mark.asyncio
async def test_unmounted_folder_keeps_its_index(file_db, stack, tmp_path):
    root = tmp_path / "drive"
    root.mkdir()
    (root / "a.txt").write_text("Persistent heron facts.")
    async with database.AsyncSessionLocal() as db:
        folder = WatchedFolder(path=str(root))
        db.add(folder)
        await db.commit()
        folder_id = folder.id
    indexer = indexer_module.indexer
    await indexer.scan_folder(folder_id)
    async with database.AsyncSessionLocal() as db:
        for file_id in (await db.execute(select(IndexedFile.id))).scalars().all():
            await indexer.index_file(file_id)
    moved = tmp_path / "drive-away"
    shutil.move(root, moved)
    await indexer.scan_folder(folder_id)
    async with database.AsyncSessionLocal() as db:
        assert (await db.get(WatchedFolder, folder_id)).status == "unavailable"
        assert [row.name for row in (await db.execute(select(IndexedFile))).scalars()] == ["a.txt"]
        assert (await search_memory(db, "heron"))[0]["title"] == "a.txt"
    assert os.path.isdir(moved)
