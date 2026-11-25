import asyncio
import os
import time
from collections import deque
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update

from app.core.logging import get_logger
from app.db import session as database
from app.models.files import IndexedFile, WatchedFolder
from app.services import chunk_store
from app.services.chunk_index import chunk_index
from app.services.embedder import embedder
from app.services.file_extract import Unreadable, extract_text, file_hash
from app.services.scanner import MAX_BYTES, scan, wanted

logger = get_logger(__name__)
SAVE_EVERY = 25


class Indexer:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.queued = set()
        self.current = None
        self.worker = None
        self.unsaved = 0
        self.lock = asyncio.Lock()
        self.running = asyncio.Event()
        self.running.set()
        self.finished = deque(maxlen=50)

    def start(self):
        if self.worker is None or self.worker.done():
            self.worker = asyncio.create_task(self.run())

    async def stop(self):
        if self.worker:
            self.worker.cancel()
        if self.unsaved:
            chunk_index.save()
            self.unsaved = 0

    def enqueue(self, file_id):
        if file_id not in self.queued:
            self.queued.add(file_id)
            self.queue.put_nowait(file_id)

    def pause(self):
        self.running.clear()

    def resume(self):
        self.running.set()

    async def enqueue_unfinished(self, statuses=("pending", "partial")):
        async with database.AsyncSessionLocal() as db:
            statement = select(IndexedFile.id).where(IndexedFile.status.in_(statuses)).order_by(IndexedFile.mtime_ns.desc())
            ids = (await db.execute(statement)).scalars().all()
        for file_id in ids:
            self.enqueue(file_id)

    async def rebuild_if_needed(self):
        if not chunk_index.needs_rebuild:
            return
        async with database.AsyncSessionLocal() as db:
            await db.execute(update(IndexedFile).where(IndexedFile.status == "indexed").values(status="partial"))
            await db.commit()
        await self.enqueue_unfinished(("partial",))

    async def finish_rebuild(self):
        if not chunk_index.needs_rebuild:
            return
        async with database.AsyncSessionLocal() as db:
            waiting = await db.scalar(select(func.count()).where(IndexedFile.status.in_(("pending", "partial"))))
        if not waiting:
            chunk_index.save()
            chunk_index.mark_current()

    async def run(self):
        while True:
            file_id = await self.queue.get()
            await self.running.wait()
            self.current = file_id
            try:
                await self.index_file(file_id)
            except Exception as exc:
                logger.error("Indexing file %s failed: %s", file_id, exc, exc_info=True)
            finally:
                self.finished.append(time.monotonic())
                self.queued.discard(file_id)
                self.current = None
                if self.queue.empty():
                    if self.unsaved:
                        chunk_index.save()
                        self.unsaved = 0
                    await self.finish_rebuild()

    async def scan_folder(self, folder_id):
        async with self.lock, database.AsyncSessionLocal() as db:
            folder = await db.get(WatchedFolder, folder_id)
            if folder is None or not folder.enabled:
                return
            if not os.path.isdir(folder.path):
                folder.status = "unavailable"
                await db.commit()
                return
            found = {item["path"]: item for item in await asyncio.to_thread(scan, folder.path, folder.exclude_globs)}
            rows = {row.path: row for row in (await db.execute(select(IndexedFile).where(IndexedFile.folder_id == folder_id))).scalars()}
            for path, row in rows.items():
                if path not in found:
                    await self.remove_file(db, row)
            for path, item in found.items():
                row = rows.get(path)
                if row is None:
                    db.add(IndexedFile(folder_id=folder_id, **item))
                elif (row.size, row.mtime_ns) != (item["size"], item["mtime_ns"]) or row.status in {"pending", "failed"}:
                    row.size, row.mtime_ns, row.status = item["size"], item["mtime_ns"], "pending"
            folder.last_scan_at = datetime.now(UTC).replace(tzinfo=None)
            folder.status = "ready"
            await db.commit()
        await self.enqueue_unfinished(("pending",))

    async def sync_path(self, folder_id, path):
        async with self.lock, database.AsyncSessionLocal() as db:
            folder = await db.get(WatchedFolder, folder_id)
            if folder is None or not folder.enabled or not os.path.isdir(folder.path):
                return
            row = (await db.execute(select(IndexedFile).where(IndexedFile.path == path))).scalar_one_or_none()
            try:
                info = os.stat(path, follow_symlinks=False)
                present = wanted(path, folder.path, folder.exclude_globs) and 0 < info.st_size <= MAX_BYTES and not os.path.islink(path)
            except OSError:
                present = False
            if not present:
                if row is not None:
                    await self.remove_file(db, row)
                return
            if row is None:
                row = IndexedFile(folder_id=folder_id, path=path, name=os.path.basename(path), ext=os.path.splitext(path)[1].lower(), status="pending")
                db.add(row)
            elif (row.size, row.mtime_ns) == (info.st_size, info.st_mtime_ns) and row.status != "failed":
                return
            row.size, row.mtime_ns, row.status = info.st_size, info.st_mtime_ns, "pending"
            await db.commit()
            file_id = row.id
        self.enqueue(file_id)

    async def scan_folder_later(self, folder_id):
        asyncio.create_task(self.scan_folder(folder_id))

    async def remove_file(self, db, row):
        old_ids = await chunk_store.remove_source(db, "file", row.id)
        await db.delete(row)
        await db.commit()
        if old_ids:
            chunk_index.remove(old_ids)
            self.unsaved += 1

    async def index_file(self, file_id):
        async with database.AsyncSessionLocal() as db:
            row = await db.get(IndexedFile, file_id)
            if row is None:
                return
            try:
                digest = await asyncio.to_thread(file_hash, row.path)
            except OSError:
                await self.remove_file(db, row)
                return
            if digest == row.content_hash and row.chunk_count and row.status in {"indexed", "pending"}:
                row.status = "indexed"
                await db.commit()
                return
            try:
                text = await asyncio.to_thread(extract_text, row.path, row.ext)
            except (Unreadable, OSError) as exc:
                old_ids = await chunk_store.remove_source(db, "file", row.id)
                row.status, row.error, row.chunk_count, row.content_hash = "skipped", str(exc), 0, digest
                await db.commit()
                chunk_index.remove(old_ids)
                return
            old_ids, chunks = await chunk_store.replace_source(db, "file", row.id, row.name, text)
            row.content_hash, row.chunk_count, row.error = digest, len(chunks), None
            row.indexed_at = datetime.now(UTC).replace(tzinfo=None)
            try:
                vectors = await asyncio.to_thread(embedder.embed_documents, [f"{row.name}\n{chunk.text}" for chunk in chunks])
                chunk_index.remove(old_ids)
                chunk_index.add([chunk.id for chunk in chunks], vectors)
                row.status = "indexed"
            except Exception as exc:
                chunk_index.remove(old_ids)
                row.status, row.error = "partial", f"Semantic search unavailable: {exc}"
            await db.commit()
            self.unsaved += 1
            if self.unsaved >= SAVE_EVERY:
                chunk_index.save()
                self.unsaved = 0

    async def status(self):
        async with database.AsyncSessionLocal() as db:
            rows = (await db.execute(select(IndexedFile.status, func.count()).group_by(IndexedFile.status))).all()
        per_second = None
        if len(self.finished) >= 2 and self.finished[-1] > self.finished[0]:
            per_second = (len(self.finished) - 1) / (self.finished[-1] - self.finished[0])
        waiting = self.queue.qsize() + (1 if self.current else 0)
        return {
            "files": dict(rows),
            "queued": self.queue.qsize(),
            "paused": not self.running.is_set(),
            "files_per_minute": round(per_second * 60, 1) if per_second else None,
            "eta_seconds": round(waiting / per_second) if per_second and waiting else None,
            "current": self.current,
            "vectors": chunk_index.count,
            "embedding": embedder.status(),
        }

    async def forget_folder(self, db, folder):
        ids = (await db.execute(select(IndexedFile.id).where(IndexedFile.folder_id == folder.id))).scalars().all()
        removed = []
        for file_id in ids:
            removed += await chunk_store.remove_source(db, "file", file_id)
        await db.execute(delete(IndexedFile).where(IndexedFile.folder_id == folder.id))
        await db.delete(folder)
        await db.commit()
        chunk_index.remove(removed)
        chunk_index.save()


indexer = Indexer()
