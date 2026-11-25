import asyncio
import os
from collections import deque

import httpx
import pytest
from sqlalchemy import select

from app.db import session as database
from app.main import app
from app.models.files import IndexedFile, WatchedFolder
from app.services import indexer as indexer_module
from tests.test_watcher import eventually, rows


async def fresh_indexer(monkeypatch):
    indexer = indexer_module.indexer
    monkeypatch.setattr(indexer, "lock", asyncio.Lock())
    monkeypatch.setattr(indexer, "queue", asyncio.Queue())
    monkeypatch.setattr(indexer, "queued", set())
    monkeypatch.setattr(indexer, "running", asyncio.Event())
    monkeypatch.setattr(indexer, "finished", deque(maxlen=50))
    indexer.running.set()
    return indexer


async def add_folder_with(root, names):
    for name in names:
        (root / name).write_text(f"Content of {name} about lighthouses.")
    async with database.AsyncSessionLocal() as db:
        folder = WatchedFolder(path=str(root))
        db.add(folder)
        await db.commit()
        return folder.id


@pytest.mark.asyncio
async def test_newest_files_are_queued_first(file_db, stack, tmp_path, monkeypatch):
    indexer = await fresh_indexer(monkeypatch)
    (tmp_path / "docs").mkdir()
    folder_id = await add_folder_with(tmp_path / "docs", ["old.txt", "mid.txt", "new.txt"])
    for age, name in enumerate(["old.txt", "mid.txt", "new.txt"]):
        os.utime(tmp_path / "docs" / name, (1_700_000_000 + age * 1000,) * 2)
    await indexer.scan_folder(folder_id)
    order = []
    while not indexer.queue.empty():
        file_id = indexer.queue.get_nowait()
        async with database.AsyncSessionLocal() as db:
            order.append((await db.get(IndexedFile, file_id)).name)
    assert order == ["new.txt", "mid.txt", "old.txt"]


@pytest.mark.asyncio
async def test_pause_holds_work_until_resume(file_db, stack, tmp_path, monkeypatch):
    indexer = await fresh_indexer(monkeypatch)
    (tmp_path / "docs").mkdir()
    folder_id = await add_folder_with(tmp_path / "docs", ["a.txt"])
    indexer.start()
    try:
        indexer.pause()
        await indexer.scan_folder(folder_id)
        await asyncio.sleep(0.5)
        assert (await indexer.status())["paused"] is True
        assert (await rows())["a.txt"].status == "pending"
        indexer.resume()

        async def done():
            return (await rows())["a.txt"].status == "indexed"

        assert await eventually(done)
        assert (await indexer.status())["paused"] is False
    finally:
        await indexer.stop()
        indexer.worker = None


@pytest.mark.asyncio
async def test_status_estimates_time_remaining(file_db, stack, monkeypatch):
    indexer = await fresh_indexer(monkeypatch)
    indexer.finished.extend([100.0, 101.0, 102.0, 103.0])
    for file_id in (1, 2, 3):
        indexer.queue.put_nowait(file_id)
    status = await indexer.status()
    assert status["files_per_minute"] == 60.0
    assert status["eta_seconds"] == 3


@pytest.mark.asyncio
async def test_pause_and_resume_endpoints(client_override, stack, monkeypatch):
    indexer = await fresh_indexer(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
        assert (await client.post("/index/pause")).json()["paused"] is True
        assert indexer.running.is_set() is False
        assert (await client.post("/index/resume")).json()["paused"] is False
        assert indexer.running.is_set() is True
