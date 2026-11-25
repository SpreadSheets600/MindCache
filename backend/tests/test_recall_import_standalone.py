import io
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile

from app.services.recall_import import parse_recall


class RecallImportTests(unittest.TestCase):
    def test_json_reports_missing_original_and_idempotent_key(self):
        data = json.dumps({"memories": [{"title": "note", "content": "text", "path": "/old/file.png", "content_hash": "abc"}]}).encode()
        first = parse_recall(data)[0]
        self.assertTrue(first["missing"])
        self.assertIsNone(first["original"])
        self.assertEqual(first["key"], parse_recall(data)[0]["key"])

    def test_unsafe_archive_paths_are_rejected(self):
        stream = io.BytesIO()
        with ZipFile(stream, "w") as archive:
            archive.writestr("manifest.json", '{"memories": []}')
            archive.writestr("../bad", "bad")
        with self.assertRaises(ValueError):
            parse_recall(stream.getvalue())

    def test_pack_preserves_managed_file_and_does_not_read_outside(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data"
            uploads = data / "uploads"
            uploads.mkdir(parents=True)
            (uploads / "photo.png").write_bytes(b"original-image")
            outside = root / "private.txt"
            outside.write_text("private")
            with sqlite3.connect(data / "recall.db") as db:
                db.execute("CREATE TABLE memories (id INTEGER, title TEXT, content TEXT, path TEXT, content_hash TEXT, embedding BLOB)")
                db.execute("INSERT INTO memories VALUES (1, 'image', 'text', ?, 'one', NULL)", (str(uploads / 'photo.png'),))
                db.execute("INSERT INTO memories VALUES (2, 'other', 'text', ?, 'two', NULL)", (str(outside),))
            output = root / "export.zip"
            script = Path(__file__).resolve().parents[2] / "scripts/pack_recall.py"
            subprocess.run([sys.executable, str(script), str(data), str(output)], check=True, capture_output=True)
            records = parse_recall(output.read_bytes())
            self.assertEqual(records[0]["original"], b"original-image")
            self.assertTrue(records[1]["missing"])
            self.assertIsNone(records[1]["original"])


class RecallDatabaseTests(unittest.TestCase):
    def test_preview_import_and_reimport(self):
        import asyncio
        from types import ModuleType
        from unittest.mock import patch
        from sqlalchemy import create_engine
        from sqlalchemy.orm import Session
        from app.db.base import Base
        import app.models.document
        from app.models.item import RecallImport, SavedItem

        class Adapter:
            def __init__(self, session): self.session = session
            async def execute(self, *args): return self.session.execute(*args)
            async def flush(self): self.session.flush()
            async def commit(self): self.session.commit()
            def add(self, item): self.session.add(item)

        class Upload:
            def __init__(self, raw): self.stream = io.BytesIO(raw)
            async def read(self, size): return self.stream.read(size)

        dependency = ModuleType("app.db.session")
        dependency.get_db = lambda: None
        with patch.dict(sys.modules, {"app.db.session": dependency}):
            from app.api.recall import import_recall, preview
            engine = create_engine("sqlite:///:memory:")
            Base.metadata.create_all(engine)
            raw = json.dumps({"memories": [{"title": "old", "content": "remember", "content_hash": "x", "path": "/old/file"}]}).encode()
            with Session(engine, expire_on_commit=False) as session:
                async def exercise():
                    db = Adapter(session)
                    self.assertEqual((await preview(Upload(raw), db))["missing_originals"], 1)
                    self.assertEqual((await import_recall(Upload(raw), db))["imported"], 1)
                    self.assertEqual((await import_recall(Upload(raw), db))["skipped"], 1)
                    self.assertEqual(session.query(SavedItem).count(), 1)
                    self.assertEqual(session.query(RecallImport).one().metadata_json["title"], "old")
                asyncio.run(exercise())
            engine.dispose()
