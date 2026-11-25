import asyncio
import os

from sqlalchemy import select
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from app.core.logging import get_logger
from app.db import session as database
from app.models.files import WatchedFolder
from app.services.indexer import indexer

logger = get_logger(__name__)
DEBOUNCE_SECONDS = 2.0
POLL_SECONDS = 300
FULL_SCAN_SECONDS = 6 * 3600
USEFUL_EVENTS = {"created", "modified", "deleted", "moved", "closed"}


class Handler(FileSystemEventHandler):
    def __init__(self, watcher, folder_id):
        self.watcher = watcher
        self.folder_id = folder_id

    def on_any_event(self, event):
        if event.event_type not in USEFUL_EVENTS:
            return
        paths = [event.src_path, getattr(event, "dest_path", "")]
        for path in filter(None, paths):
            self.watcher.loop.call_soon_threadsafe(self.watcher.touch, self.folder_id, os.fsdecode(path), event.is_directory)


class Watcher:
    def __init__(self):
        self.loop = None
        self.observer = None
        self.watches = {}
        self.pending = {}
        self.polling = set()
        self.task = None

    async def start(self):
        self.loop = asyncio.get_running_loop()
        self.observer = Observer()
        self.observer.start()
        await self.refresh()
        self.task = asyncio.create_task(self.reconcile_forever())

    async def stop(self):
        if self.task:
            self.task.cancel()
        for handle in self.pending.values():
            handle.cancel()
        self.pending.clear()
        if self.observer:
            self.observer.stop()
            self.observer.join(timeout=5)

    async def refresh(self):
        if self.observer is None:
            return
        async with database.AsyncSessionLocal() as db:
            folders = (await db.execute(select(WatchedFolder))).scalars().all()
        active = {folder.id: folder.path for folder in folders if folder.enabled and os.path.isdir(folder.path)}
        for folder_id in list(self.watches):
            if self.watches[folder_id][0] != active.get(folder_id):
                self.observer.unschedule(self.watches.pop(folder_id)[1])
        self.polling = {folder.id for folder in folders if folder.enabled} - set(self.watches)
        for folder_id, path in active.items():
            if folder_id in self.watches:
                continue
            try:
                self.watches[folder_id] = (path, self.observer.schedule(Handler(self, folder_id), path, recursive=True))
                self.polling.discard(folder_id)
            except OSError as exc:
                logger.warning("Cannot watch %s live, falling back to periodic scans: %s", path, exc)
                self.polling.add(folder_id)

    def touch(self, folder_id, path, is_directory):
        key = (folder_id, "" if is_directory else path)
        handle = self.pending.pop(key, None)
        if handle:
            handle.cancel()
        self.pending[key] = self.loop.call_later(DEBOUNCE_SECONDS, self.fire, key)

    def fire(self, key):
        self.pending.pop(key, None)
        folder_id, path = key
        if path:
            asyncio.create_task(indexer.sync_path(folder_id, path))
        else:
            asyncio.create_task(indexer.scan_folder(folder_id))

    async def reconcile_forever(self):
        elapsed = 0
        while True:
            async with database.AsyncSessionLocal() as db:
                ids = (await db.execute(select(WatchedFolder.id).where(WatchedFolder.enabled))).scalars().all()
            for folder_id in ids:
                if elapsed == 0 or folder_id in self.polling:
                    await indexer.scan_folder(folder_id)
            await asyncio.sleep(POLL_SECONDS)
            elapsed += POLL_SECONDS
            if elapsed >= FULL_SCAN_SECONDS:
                elapsed = 0
            await self.refresh()


watcher = Watcher()
