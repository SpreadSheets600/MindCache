import asyncio
import io
import sys
from types import ModuleType
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.item import SavedItem
import app.models.document


class FakeUpload:
    filename = "../notes.txt"
    def __init__(self): self.data = io.BytesIO(b"saved text")
    async def read(self, size): return self.data.read(size)


class Adapter:
    def __init__(self, session): self.session = session
    async def get(self, *args): return self.session.get(*args)
    async def execute(self, *args): return self.session.execute(*args)
    async def commit(self): self.session.commit()
    async def flush(self): self.session.flush()
    async def refresh(self, item): self.session.refresh(item)
    async def delete(self, item): self.session.delete(item)
    def add(self, item): self.session.add(item)


class ItemsSQLiteTests(unittest.TestCase):
    def test_notes_and_original_file_lifecycle(self):
        module = ModuleType("app.db.session")
        module.get_db = lambda: None
        with patch.dict(sys.modules, {"app.db.session": module}):
            from app.api.items import Note, create_note, delete_item, edit_note, get_file, get_item, list_items, upload
            engine = create_engine("sqlite:///:memory:")
            Base.metadata.create_all(engine)
            with Session(engine, expire_on_commit=False) as session:
                db = Adapter(session)
                async def exercise():
                    note = await create_note(Note(title="Cedar", content="Forest notes"), db)
                    self.assertEqual(len(await list_items("forest", db)), 1)
                    changed = await edit_note(note["id"], Note(title="Revised", content="Updated"), db)
                    self.assertEqual(changed["content"], "Updated")
                    saved = await upload(FakeUpload(), db)
                    self.assertEqual(saved["filename"], "notes.txt")
                    self.assertEqual((await get_file(saved["id"], db)).body, b"saved text")
                    self.assertEqual((await get_item(saved["id"], db))["content"], "saved text")
                    await delete_item(saved["id"], db)
                    self.assertIsNone(session.get(SavedItem, saved["id"]))
                with patch("app.api.items.index_source", AsyncMock()), patch("app.api.items.forget_source", AsyncMock()):
                    asyncio.run(exercise())
            engine.dispose()

    def test_http_routes_share_the_library(self):
        module = ModuleType("app.db.session")
        async def get_db():
            yield current[0]
        module.get_db = get_db
        current = [None]
        with patch.dict(sys.modules, {"app.db.session": module}):
            import importlib
            import app.api.items as items
            items = importlib.reload(items)
            api = FastAPI()
            api.include_router(items.router)
            engine = create_engine("sqlite:///:memory:")
            Base.metadata.create_all(engine)
            with Session(engine, expire_on_commit=False) as session:
                current[0] = Adapter(session)
                async def exercise():
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=api), base_url="http://localhost") as client:
                        created = await client.post("/items", json={"title": "Cedar", "content": "Forest notes"})
                        self.assertEqual(created.status_code, 201)
                        found = await client.get("/items", params={"query": "Forest"})
                        self.assertEqual(found.json()[0]["id"], created.json()["id"])
                        self.assertEqual((await client.delete(f"/items/{created.json()['id']}")).status_code, 200)
                with patch("app.api.items.index_source", AsyncMock()), patch("app.api.items.forget_source", AsyncMock()):
                    asyncio.run(exercise())
            engine.dispose()
